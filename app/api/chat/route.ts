import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const webhookUrl = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL;

        if (!webhookUrl) {
            return NextResponse.json(
                { error: 'N8N webhook URL is not configured' },
                { status: 500 }
            );
        }

        console.log('Sending to n8n:', { message: body.message, conversationId: body.conversationId });

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: body.message,
                conversationId: body.conversationId,
                timestamp: new Date().toISOString(),
            }),
        });

        if (!response.ok) {
            console.error('N8N response not ok:', response.status, response.statusText);
            return NextResponse.json(
                { error: `N8N request failed with status: ${response.status}` },
                { status: response.status }
            );
        }

        // Get the raw text first
        const rawText = await response.text();
        console.log('N8N raw response:', rawText);

        // Try to parse as JSON, otherwise use as plain text
        let responseText: string;
        try {
            const data = JSON.parse(rawText);
            // Handle different JSON response formats
            if (typeof data === 'string') {
                responseText = data;
            } else if (data.responseBody) {
                responseText = data.responseBody;
            } else if (data.redacted) {
                // Handle n8n redacted response format
                responseText = data.redacted;
            } else if (data.message) {
                responseText = data.message;
            } else if (data.output) {
                responseText = data.output;
            } else if (data.text) {
                responseText = data.text;
            } else {
                // Fallback: stringify the whole object
                responseText = JSON.stringify(data);
            }
        } catch {
            // Not JSON, use as plain text
            responseText = rawText;
        }

        console.log('Returning response:', responseText);
        return NextResponse.json({ responseBody: responseText });
    } catch (error) {
        console.error('Error in chat API:', error);
        return NextResponse.json(
            { error: 'Failed to process chat request' },
            { status: 500 }
        );
    }
}
