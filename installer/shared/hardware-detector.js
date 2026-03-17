import os from 'os';
import { execSync } from 'child_process';

/**
 * Hardware Detector — Scans the current system to build a hardware profile.
 *
 * Used by the installer to recommend the optimal AI model and configuration.
 * Works on macOS, Linux, and Windows.
 */
export class HardwareDetector {
  /**
   * Run all hardware detection checks.
   *
   * @returns {Promise<HardwareProfile>}
   */
  async detect() {
    const [cpu, gpu, memory, disk] = await Promise.all([
      this._detectCPU(),
      this._detectGPU(),
      this._detectMemory(),
      this._detectDisk(),
    ]);

    return { cpu, gpu, memory, disk, platform: process.platform };
  }

  // ──────────────────────────────────────────────────────────────
  // CPU Detection
  // ──────────────────────────────────────────────────────────────

  async _detectCPU() {
    const cpuList = os.cpus();
    const model = cpuList[0]?.model || 'Unknown';
    const cores = cpuList.length;
    const arch = os.arch();

    // Detect Apple Silicon
    const isAppleSilicon = process.platform === 'darwin' && (
      model.includes('Apple') || arch === 'arm64'
    );

    // Detect AVX2 (needed for efficient CPU inference on x86)
    let hasAVX2 = false;
    try {
      if (process.platform === 'linux') {
        const cpuInfo = execSync('cat /proc/cpuinfo').toString();
        hasAVX2 = cpuInfo.includes('avx2');
      } else if (process.platform === 'darwin' && !isAppleSilicon) {
        const sysctl = execSync('sysctl -a machdep.cpu.features').toString();
        hasAVX2 = sysctl.toUpperCase().includes('AVX2');
      } else if (process.platform === 'win32') {
        // On Windows, we assume AVX2 if it's a modern processor (2013+)
        hasAVX2 = true;
      } else if (isAppleSilicon) {
        // Apple Silicon doesn't use x86 extensions; Metal replaces AVX
        hasAVX2 = false;
      }
    } catch {
      // If we can't detect, assume modern hardware
      hasAVX2 = !['arm', 'arm64'].includes(arch) || isAppleSilicon;
    }

    return { model, cores, arch, isAppleSilicon, hasAVX2 };
  }

  // ──────────────────────────────────────────────────────────────
  // GPU Detection
  // ──────────────────────────────────────────────────────────────

  async _detectGPU() {
    // Try each platform-specific method in order
    if (process.platform === 'darwin') {
      return this._detectGPUmacOS();
    } else if (process.platform === 'linux') {
      return this._detectGPULinux();
    } else if (process.platform === 'win32') {
      return this._detectGPUWindows();
    }
    return { type: 'none', name: 'Unknown', vramGB: 0 };
  }

  _detectGPUmacOS() {
    try {
      const output = execSync('system_profiler SPDisplaysDataType 2>/dev/null').toString();

      // Apple Silicon — unified memory
      if (output.includes('Apple M') || os.arch() === 'arm64') {
        const totalRAM = os.totalmem() / (1024 ** 3);
        return {
          type: 'metal',
          name: 'Apple Silicon (Unified Memory)',
          vramGB: Math.floor(totalRAM), // Unified memory shared with GPU
          isUnifiedMemory: true,
        };
      }

      // Intel Mac with dGPU
      const vramMatch = output.match(/VRAM.*?:\s*([\d,]+)\s*MB/i);
      const vramMB = vramMatch ? parseInt(vramMatch[1].replace(',', '')) : 0;
      const nameMatch = output.match(/Chipset Model:\s*(.+)/i);

      if (vramMB > 0) {
        return {
          type: 'metal',
          name: nameMatch?.[1]?.trim() || 'Intel/AMD GPU',
          vramGB: vramMB / 1024,
          isUnifiedMemory: false,
        };
      }
    } catch {}

    return { type: 'none', name: 'None detected', vramGB: 0 };
  }

  _detectGPULinux() {
    // Try NVIDIA first
    try {
      const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null').toString();
      const lines = output.trim().split('\n');
      if (lines.length > 0 && lines[0]) {
        const [name, vramMB] = lines[0].split(',').map((s) => s.trim());
        return {
          type: 'cuda',
          name,
          vramGB: parseInt(vramMB) / 1024,
          isUnifiedMemory: false,
        };
      }
    } catch {}

    // Try AMD ROCm
    try {
      const output = execSync('rocm-smi --showmeminfo vram 2>/dev/null').toString();
      if (output.includes('GPU')) {
        const vramMatch = output.match(/(\d+)\s*kB/i);
        const vramGB = vramMatch ? parseInt(vramMatch[1]) / (1024 ** 2) : 0;
        return { type: 'rocm', name: 'AMD GPU (ROCm)', vramGB, isUnifiedMemory: false };
      }
    } catch {}

    return { type: 'none', name: 'None detected', vramGB: 0 };
  }

  _detectGPUWindows() {
    try {
      // Try nvidia-smi first (works in Windows if NVIDIA drivers are installed)
      const output = execSync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>nul').toString();
      const [name, vramMB] = output.trim().split(',').map((s) => s.trim());
      if (name && vramMB) {
        return {
          type: 'cuda',
          name,
          vramGB: parseInt(vramMB) / 1024,
          isUnifiedMemory: false,
        };
      }
    } catch {}

    try {
      // Generic fallback via WMIC
      const output = execSync('wmic path win32_VideoController get Name,AdapterRAM /format:csv 2>nul').toString();
      const lines = output.trim().split('\n').filter((l) => l.includes(','));
      if (lines.length > 1) {
        const [, vramBytes, name] = lines[1].split(',');
        return {
          type: 'directx',
          name: name?.trim() || 'Unknown GPU',
          vramGB: parseInt(vramBytes) / (1024 ** 3) || 0,
          isUnifiedMemory: false,
        };
      }
    } catch {}

    return { type: 'none', name: 'None detected', vramGB: 0 };
  }

  // ──────────────────────────────────────────────────────────────
  // Memory & Disk
  // ──────────────────────────────────────────────────────────────

  async _detectMemory() {
    const totalGB = os.totalmem() / (1024 ** 3);
    const freeGB = os.freemem() / (1024 ** 3);
    return {
      totalGB: Math.round(totalGB * 10) / 10,
      freeGB: Math.round(freeGB * 10) / 10,
    };
  }

  async _detectDisk() {
    try {
      let freeGB = 0;

      if (process.platform === 'win32') {
        const output = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /format:value 2>nul').toString();
        const match = output.match(/FreeSpace=(\d+)/);
        freeGB = match ? parseInt(match[1]) / (1024 ** 3) : 0;
      } else {
        const output = execSync(`df -Pk "${process.cwd()}" 2>/dev/null | tail -1`).toString();
        const parts = output.trim().split(/\s+/);
        freeGB = parts[3] ? parseInt(parts[3]) / (1024 ** 2) : 0; // 1K-blocks to GB
      }

      return { freeGB: Math.round(freeGB) };
    } catch {
      return { freeGB: -1 }; // Unknown
    }
  }
}

/**
 * @typedef {object} HardwareProfile
 * @property {{ model: string, cores: number, arch: string, isAppleSilicon: boolean, hasAVX2: boolean }} cpu
 * @property {{ type: 'cuda'|'metal'|'rocm'|'directx'|'none', name: string, vramGB: number, isUnifiedMemory?: boolean }} gpu
 * @property {{ totalGB: number, freeGB: number }} memory
 * @property {{ freeGB: number }} disk
 * @property {string} platform
 */
