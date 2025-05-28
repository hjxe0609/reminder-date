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
        
        const reminder = {
            id: Date.now().toString(),
            title: formData.get('title'),
            date: formData.get('date'),
            email: formData.get('email'),
            frequency: formData.get('frequency'),
            advanceDays: parseInt(formData.get('advanceDays')),
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

            if (response.ok) {
                this.form.reset();
                this.loadReminders();
                alert('提醒添加成功！');
            } else {
                throw new Error('添加失败');
            }
        } catch (error) {
            alert('添加提醒失败，请重试');
            console.error(error);
        }
    }

    async loadReminders() {
        try {
            const response = await fetch(`${API_BASE}/reminders`);
            const reminders = await response.json();
            this.renderReminders(reminders);
        } catch (error) {
            console.error('加载提醒失败:', error);
        }
    }

    renderReminders(reminders) {
        this.remindersList.innerHTML = reminders.map(reminder => `
            <div class="reminder-item">
                <button class="delete-btn" onclick="reminderSystem.deleteReminder('${reminder.id}')">删除</button>
                <div class="reminder-title">${reminder.title}</div>
                <div class="reminder-details">
                    📅 ${reminder.date} | 
                    🔄 ${this.getFrequencyText(reminder.frequency)} | 
                    ⏰ 提前${reminder.advanceDays}天 |
                    📧 ${reminder.email}
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

            if (response.ok) {
                this.loadReminders();
                alert('删除成功！');
            } else {
                throw new Error('删除失败');
            }
        } catch (error) {
            alert('删除失败，请重试');
            console.error(error);
        }
    }
}

const reminderSystem = new ReminderSystem();
