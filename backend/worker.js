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

            // 添加提醒
            if (method === 'POST' && path === '/reminders') {
                console.log('Received POST request to /reminders');
                
                try {
                    const reminder = await request.json();
                    console.log('Parsed reminder data:', JSON.stringify(reminder));
                    
                    // 验证必要字段
                    if (!reminder.title || !reminder.date || !reminder.email) {
                        return new Response(JSON.stringify({ 
                            error: 'Bad Request', 
                            message: 'Missing required fields: title, date, email' 
                        }), { 
                            status: 400, 
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                        });
                    }
                    
                    const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                    console.log('Current reminders count:', reminders.length);
                    
                    // 添加默认值和状态跟踪
                    const newReminder = {
                        ...reminder,
                        advanceDays: reminder.advanceDays || 0,
                        frequency: reminder.frequency || 'once',
                        lastSent: null, // 记录最后发送时间
                        nextCheck: calculateNextCheckDate(reminder.date, reminder.advanceDays)
                    };
                    
                    reminders.push(newReminder);
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
                if (!id) {
                    return new Response(JSON.stringify({ 
                        error: 'Bad Request', 
                        message: 'Missing reminder ID' 
                    }), { 
                        status: 400, 
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                
                const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
                const initialLength = reminders.length;
                const filteredReminders = reminders.filter(r => r.id !== id);
                
                if (filteredReminders.length === initialLength) {
                    return new Response(JSON.stringify({ 
                        error: 'Not Found', 
                        message: 'Reminder not found' 
                    }), { 
                        status: 404, 
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                    });
                }
                
                await env.REMINDERS_KV.put('reminders', JSON.stringify(filteredReminders));
                
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // 定时检查提醒 - 改进版
            if (method === 'GET' && path === '/cron/check-reminders') {
                return await this.checkReminders(env);
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });

        } catch (error) {
            console.error('Unexpected error:', error);
            return new Response('Internal Server Error: ' + error.message, { 
                status: 500, 
                headers: corsHeaders 
            });
        }
    },

    // 定时触发器 - 改进版
    async scheduled(controller, env, ctx) {
        console.log('Scheduled task triggered');
        await this.checkReminders(env);
    },

    // 独立的检查提醒方法
    async checkReminders(env) {
        try {
            const reminders = await env.REMINDERS_KV.get('reminders', 'json') || [];
            const today = new Date();
            const updatedReminders = [];
            let emailsSent = 0;
            
            console.log(`Checking ${reminders.length} reminders`);
            
            for (const reminder of reminders) {
                let updatedReminder = { ...reminder };
                const reminderDate = new Date(reminder.date);
                
                // 计算距离事件的天数
                const daysDiff = Math.ceil((reminderDate - today) / (1000 * 60 * 60 * 24));
                
                console.log(`Reminder: ${reminder.title}, Days diff: ${daysDiff}, Advance days: ${reminder.advanceDays}`);
                
                // 检查是否应该发送提醒
                const shouldSendReminder = (
                    daysDiff === reminder.advanceDays && 
                    (!reminder.lastSent || !isSameDay(new Date(reminder.lastSent), today))
                );
                
                if (shouldSendReminder) {
                    console.log(`Sending reminder for: ${reminder.title}`);
                    const emailSent = await sendEmailReminder(reminder, env);
                    if (emailSent) {
                        updatedReminder.lastSent = today.toISOString();
                        emailsSent++;
                    }
                }
                
                // 处理重复提醒的日期更新
                if (daysDiff < 0 && reminder.frequency !== 'once') {
                    if (reminder.frequency === 'yearly') {
                        const nextYear = new Date(reminderDate);
                        nextYear.setFullYear(nextYear.getFullYear() + 1);
                        updatedReminder.date = nextYear.toISOString().split('T')[0];
                        updatedReminder.lastSent = null; // 重置发送状态
                        console.log(`Updated yearly reminder to: ${updatedReminder.date}`);
                    } else if (reminder.frequency === 'monthly') {
                        const nextMonth = new Date(reminderDate);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        updatedReminder.date = nextMonth.toISOString().split('T')[0];
                        updatedReminder.lastSent = null; // 重置发送状态
                        console.log(`Updated monthly reminder to: ${updatedReminder.date}`);
                    }
                }
                
                // 只保留有效的提醒（一次性提醒在过期后删除）
                if (!(reminder.frequency === 'once' && daysDiff < -1)) {
                    updatedReminders.push(updatedReminder);
                }
            }
            
            // 保存更新后的提醒列表
            await env.REMINDERS_KV.put('reminders', JSON.stringify(updatedReminders));
            
            const message = `Reminders checked. Emails sent: ${emailsSent}, Active reminders: ${updatedReminders.length}`;
            console.log(message);
            
            return new Response(message, { headers: corsHeaders });
            
        } catch (error) {
            console.error('Error in checkReminders:', error);
            return new Response('Error checking reminders: ' + error.message, { 
                status: 500, 
                headers: corsHeaders 
            });
        }
    }
};

// 辅助函数
function calculateNextCheckDate(eventDate, advanceDays) {
    const date = new Date(eventDate);
    date.setDate(date.getDate() - advanceDays);
    return date.toISOString().split('T')[0];
}

function isSameDay(date1, date2) {
    return date1.toDateString() === date2.toDateString();
}

// 改进的发送邮件提醒函数
async function sendEmailReminder(reminder, env) {
    if (!env.RESEND_API_KEY) {
        console.log('No email API key configured');
        return false;
    }

    const emailData = {
        from: { email: "noreply@your-domain.com", name: "提醒系统" },
        to: [{ email: reminder.email }],
        subject: `🔔 提醒：${reminder.title}`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">📅 您有一个重要提醒</h2>
                <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>事项：</strong>${escapeHtml(reminder.title)}</p>
                    <p><strong>日期：</strong>${reminder.date}</p>
                    <p><strong>提醒设置：</strong>提前${reminder.advanceDays}天</p>
                    <p><strong>重复：</strong>${getFrequencyText(reminder.frequency)}</p>
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
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Email API error:', response.status, errorText);
            return false;
        }
        
        const result = await response.text();
        console.log('Email sent successfully:', result);
        return true;
        
    } catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
}

// 辅助函数
function getFrequencyText(frequency) {
    const map = {
        'yearly': '每年',
        'monthly': '每月',
        'once': '仅一次'
    };
    return map[frequency] || frequency;
}

function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
