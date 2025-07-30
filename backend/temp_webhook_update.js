// เพิ่มส่วนนี้ใน send message endpoint
                const payload = {
                    message,
                    userId,
                    sessionId,
                    user: {
                        id: req.user.id,
                        email: req.user.email,
                        firstName: req.user.first_name,
                        lastName: req.user.last_name
                    },
                    session: {
                        id: sessionId,
                        name: sessionResult.rows[0].session_name || `Chat ${sessionId}`
                    },
                    timestamp: new Date().toISOString(),
                    // เพิ่ม unique message ID เพื่อป้องกันการตอบกลับผิด
                    messageId: uuidv4(),
                    // เพิ่ม callback URL หาก n8n ต้องการส่งกลับมาแบบ async
                    callbackUrl: `${config.server.publicUrl}/api/webhook/callback`
                };
