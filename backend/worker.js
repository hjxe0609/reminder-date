const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // 处理 CORS 预检请求
        if (method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // 获取所有提醒
            if (method === 'GET' && path === '/reminders') {
                const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                return new Response(JSON.stringify(reminders), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 添加提醒的部分
            if (method === 'POST' && path === '/reminders') {
                console.log('Received POST request to /reminders');
                
                try {
                    const reminder = await request.json();
                    console.log('Parsed reminder data:', JSON.stringify(reminder));
                    
                    const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                    console.log('Current reminders count:', reminders.length);
                    
                    reminders.push(reminder);
                    await env.REMINDERS_KV.put('reminders', JSON.stringify(reminders));
                    console.log('Successfully saved reminder to KV');
                    
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    console.error('Error in POST /reminders:', error.message, error.stack);
                    return new Response(JSON.stringify({ 
                        error: 'Bad Request', 
                        message: error.message 
                    }), { 
                        status: 400, 
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
            }

            // 删除提醒
            if (method === 'DELETE' && path.startsWith('/reminders/')) {
                const id = path.split('/')[2];
                const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                
                const filteredReminders = reminders.filter(r => r.id !== id);
                await env.REMINDERS_KV.put('reminders', JSON.stringify(filteredReminders));
                
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 定时检查提醒
            if (method === 'GET' && path === '/cron/check-reminders') {
                const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                const today = new Date();
                
                for (const reminder of reminders) {
                    const reminderDate = new Date(reminder.date);
                    const daysDiff = Math.ceil((reminderDate - today) / (1000 * 60 * 60 * 24));
                    
                    // 检查是否需要发送提醒
                    if (daysDiff === reminder.advanceDays) {
                        await sendEmailReminder(reminder, env);
                    }
                    
                    // 处理重复提醒
                    if (reminder.frequency === 'yearly' && daysDiff < 0) {
                        const nextYear = new Date(reminderDate);
                        nextYear.setFullYear(nextYear.getFullYear() + 1);
                        reminder.date = nextYear.toISOString().split('T')[0];
                    } else if (reminder.frequency === 'monthly' && daysDiff < 0) {
                        const nextMonth = new Date(reminderDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        reminder.date = nextMonth.toISOString().split('T')[0];
                    }
                }
                
                await env.REMINDERS_KV.put('reminders', JSON.stringify(reminders));
                return new Response('Reminders checked', { headers: corsHeaders });
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            return new Response('Internal Server Error: ' + error.message, { 
                status: 500, 
                headers: corsHeaders 
            });
        }
    },

    // 定时触发器
    async scheduled(controller, env, ctx) {
        const request = new Request('https://dummy-url/cron/check-reminders');
        await this.fetch(request, env, ctx);
    }
};

// 发送邮件提醒函数
async function sendEmailReminder(reminder, env) {
    if (!env.RESEND_API_KEY) {
        console.log('No email API key configured');
        return;
    }

    const emailData = {
        from: { email: "noreply@your-domain.com", name: "提醒系统" },
        to: [{ email: reminder.email }],
        subject: `🔔 提醒：${reminder.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">📅 您有一个重要提醒</h2>
                <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>事项：</strong>${reminder.title}</p>
                    <p><strong>日期：</strong>${reminder.date}</p>
                    <p><strong>提醒设置：</strong>提前${reminder.advanceDays}天</p>
                    <p><strong>重复：</strong>${reminder.frequency === 'yearly' ? '每年' : reminder.frequency === 'monthly' ? '每月' : '仅一次'}</p>
                </div>
                <hr style="border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 12px;">此邮件由提醒系统自动发送</p>
            </div>
        `
    };

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(emailData)
        });
        
        console.log('Email sent:', await response.text());
    } catch (error) {
        console.error('Error sending email:', error);
    }
}
