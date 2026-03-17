# Guide: API Integration

Connecting the chatbot to your business logic is essential for operations like checking order status or product availability.

## 1. Authentication
The library supports common auth methods:
-   **API Keys**: Passed in the headers.
-   **JWT**: The library can handle token refreshing if an auth endpoint is provided.

```json
{
  "auth": {
    "type": "Bearer",
    "token_endpoint": "https://api.example.com/oauth/token",
    "client_id": "...",
    "client_secret": "..."
  }
}
```

## 2. Defining Tools (Function Calling)
The AI interacts with your API via defined "tools".

### Example Tool Definition:
```javascript
const tools = [
  {
    name: "get_order_status",
    description: "Retrieves the status and delivery date of an order",
    parameters: {
      order_id: "string",
      customer_email: "string"
    }
  }
];
```

## 3. Data Flow
1.  **AI recognizes intent**: "Donde esta mi pedido 123?"
2.  **AI checks for required info**: If `customer_email` is missing, it asks the user.
3.  **Library triggers Hook**: Once `order_id` and `customer_email` are gathered, the library calls the mapped API endpoint.
4.  **API Response**: `{ "status": "Shipped", "delivery_date": "2026-03-20" }`
5.  **AI formulates response**: "Tu pedido 123 ya fue enviado y llegará el 20 de Marzo."

## 4. Security Recommendations
-   Never expose internal DB IDs directly.
-   Implement rate limiting on your business APIs.
-   Use a middleware/proxy to sanitize and validate AI-generated parameters.
