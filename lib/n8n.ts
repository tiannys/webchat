interface N8nResponse {
    responseBody?: string;
    [key: string]: unknown;
}

export async function sendMessageToN8n(message: string, conversationId?: string): Promise<string> {
    try {
        // Use API route to proxy the request (avoids Mixed Content issues on HTTPS)
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                conversationId,
            }),
        });

        if (!response.ok) {
            throw new Error(`Request failed with status: ${response.status}`);
        }

        const data: N8nResponse = await response.json();

        if (data.error) {
            throw new Error(data.error as string);
        }

        // Handle different response formats
        if (typeof data === 'string') {
            return data;
        }

        if (data.responseBody) {
            return data.responseBody;
        }

        // Fallback: stringify the response if it's an object
        return JSON.stringify(data);
    } catch (error) {
        console.error('Error sending message to N8N:', error);
        throw error;
    }
}
