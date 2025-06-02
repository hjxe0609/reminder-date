const API_BASE = 'https://reminder-system-api.morimiss.workers.dev/';

class ReminderSystem {
    constructor() {
        this.form = document.getElementById('reminderForm');
        this.remindersList = document.getElementById('remindersList');
        this.init();
    }

    init() {
        this.form.addEventListener('submit', this.handleSubmit.bind(this));
        this.loadReminders();
    }

    async handleSubmit(e) {
        e.preventDefault();
        const formData = new FormData(this.form);
        
        // 添加基本验证
        const title = formData.get('title').trim();
        const email = formData.get('email').trim();
        const date = formData.get('date');
        
        if (!title || !email || !date) {
            alert('请填写所有必填字段');
            return;
        }

        const reminder = {
            id: Date.now().toString(),
            title: title,
            date: date,
            email: email,
            frequency: formData.get('frequency'),
            advanceDays: parseInt(formData.get('advanceDays')) || 0,
            created: new Date().toISOString()
        };

        try {
            const response = await fetch(`${API_BASE}/reminders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reminder)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            this.form.reset();
            this.loadReminders();
            alert('提醒添加成功！');
        } catch (error) {
            alert('添加提醒失败，请重试');
            console.error('添加提醒错误:', error);
        }
    }

    async loadReminders() {
        try {
            const response = await fetch(`${API_BASE}/reminders`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const reminders = await response.json();
            this.renderReminders(Array.isArray(reminders) ? reminders : []);
        } catch (error) {
            console.error('加载提醒失败:', error);
            // 显示空状态或错误信息
            this.remindersList.innerHTML = '<div class="error-message">加载提醒失败，请刷新页面重试</div>';
        }
    }

    // 添加 HTML 转义函数防止 XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderReminders(reminders) {
        if (reminders.length === 0) {
            this.remindersList.innerHTML = '<div class="empty-message">暂无提醒</div>';
            return;
        }

        this.remindersList.innerHTML = reminders.map(reminder => `
            <div class="reminder-item">
                <button class="delete-btn" onclick="reminderSystem.deleteReminder('${reminder.id}')">删除</button>
                <div class="reminder-title">${this.escapeHtml(reminder.title)}</div>
                <div class="reminder-details">
                    📅 ${reminder.date} | 
                    🔄 ${this.getFrequencyText(reminder.frequency)} | 
                    ⏰ 提前${reminder.advanceDays}天 |
                    📧 ${this.escapeHtml(reminder.email)}
                </div>
            </div>
        `).join('');
    }

    getFrequencyText(frequency) {
        const map = {
            'yearly': '每年',
            'monthly': '每月',
            'once': '仅一次'
        };
        return map[frequency] || frequency;
    }

    async deleteReminder(id) {
        if (!confirm('确定要删除这个提醒吗？')) return;
        
        try {
            const response = await fetch(`${API_BASE}/reminders/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.loadReminders();
            alert('删除成功！');
        } catch (error) {
            alert('删除失败，请重试');
            console.error('删除提醒错误:', error);
        }
    }
}

const reminderSystem = new ReminderSystem();
