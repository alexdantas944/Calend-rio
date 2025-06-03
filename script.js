
// Configuração do IndexedDB
class CalendarDatabase {
    constructor() {
        this.dbName = 'TSLogisticaCalendar';
        this.version = 1;
        this.db = null;
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('schedules')) {
                    const store = db.createObjectStore('schedules', { keyPath: 'id' });
                    store.createIndex('month', 'month', { unique: false });
                    store.createIndex('year', 'year', { unique: false });
                }
            };
        });
    }
    
    async saveSchedule(data) {
        const transaction = this.db.transaction(['schedules'], 'readwrite');
        const store = transaction.objectStore('schedules');
        
        const scheduleData = {
            id: `${data.year}-${data.month}`,
            year: data.year,
            month: data.month,
            lastDayOff: data.lastDayOff,
            timestamp: Date.now()
        };
        
        return store.put(scheduleData);
    }
    
    async getSchedule(year, month) {
        const transaction = this.db.transaction(['schedules'], 'readonly');
        const store = transaction.objectStore('schedules');
        const request = store.get(`${year}-${month}`);
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

// Classe principal do calendário
class ShiftCalendar {
    constructor() {
        this.currentDate = new Date();
        this.lastDayOff = null;
        this.database = new CalendarDatabase();
        this.monthNames = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        
        this.init();
    }
    
    async init() {
        try {
            await this.database.init();
            await this.loadSavedData();
            this.bindEvents();
            this.renderCalendar();
            this.setupPWA();
            this.addKeyboardNavigation();
        } catch (error) {
            console.error('Erro na inicialização:', error);
            this.showToast('Erro ao carregar dados salvos', 'error');
        }
    }
    
    async loadSavedData() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        try {
            const savedData = await this.database.getSchedule(year, month);
            if (savedData && savedData.lastDayOff) {
                this.lastDayOff = new Date(savedData.lastDayOff);
                document.getElementById('lastDayOff').value = savedData.lastDayOff;
            } else {
                this.setTodayAsDefault();
            }
        } catch (error) {
            console.error('Erro ao carregar dados:', error);
            this.setTodayAsDefault();
        }
    }
    
    async saveCurrentData() {
        if (this.lastDayOff) {
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth();
            
            try {
                await this.database.saveSchedule({
                    year,
                    month,
                    lastDayOff: this.lastDayOff.toISOString().split('T')[0]
                });
                this.showToast('Dados salvos automaticamente', 'success');
            } catch (error) {
                console.error('Erro ao salvar dados:', error);
                this.showToast('Erro ao salvar dados', 'error');
            }
        }
    }
    
    bindEvents() {
        const prevBtn = document.getElementById('prevMonth');
        const nextBtn = document.getElementById('nextMonth');
        const updateBtn = document.getElementById('updateSchedule');
        const shareBtn = document.getElementById('shareWhatsApp');
        const dateInput = document.getElementById('lastDayOff');
        
        prevBtn.addEventListener('click', () => this.navigateMonth(-1));
        nextBtn.addEventListener('click', () => this.navigateMonth(1));
        updateBtn.addEventListener('click', () => this.updateLastDayOff());
        shareBtn.addEventListener('click', () => this.shareWhatsApp());
        dateInput.addEventListener('change', () => this.updateLastDayOff());
        
        // Feedback visual nos botões
        [prevBtn, nextBtn, updateBtn, shareBtn].forEach(btn => {
            btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.95)');
            btn.addEventListener('mouseup', () => btn.style.transform = '');
            btn.addEventListener('mouseleave', () => btn.style.transform = '');
        });
    }
    
    setupPWA() {
        // Registrar Service Worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(() => console.log('Service Worker registrado'))
                .catch(err => console.error('Erro no Service Worker:', err));
        }
        
        // PWA Install
        let deferredPrompt;
        const installBtn = document.getElementById('installPWA');
        
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'block';
        });
        
        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                
                if (outcome === 'accepted') {
                    this.showToast('App instalado com sucesso!', 'success');
                }
                
                deferredPrompt = null;
                installBtn.style.display = 'none';
            }
        });
    }
    
    showToast(message, type = 'success') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.add('show');
        
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    addKeyboardNavigation() {
        document.addEventListener('keydown', (e) => {
            switch(e.key) {
                case 'ArrowLeft':
                    if (e.ctrlKey) {
                        this.navigateMonth(-1);
                        e.preventDefault();
                    }
                    break;
                case 'ArrowRight':
                    if (e.ctrlKey) {
                        this.navigateMonth(1);
                        e.preventDefault();
                    }
                    break;
                case 'Home':
                    if (e.ctrlKey) {
                        this.goToToday();
                        e.preventDefault();
                    }
                    break;
            }
        });
    }
    
    async navigateMonth(direction) {
        const container = document.querySelector('.container');
        container.classList.add('loading');
        
        setTimeout(async () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + direction);
            await this.loadSavedData();
            this.renderCalendar();
            container.classList.remove('loading');
        }, 150);
    }
    
    goToToday() {
        this.currentDate = new Date();
        this.renderCalendar();
    }
    
    setTodayAsDefault() {
        const today = new Date();
        const todayString = today.toISOString().split('T')[0];
        document.getElementById('lastDayOff').value = todayString;
        this.lastDayOff = new Date(today);
    }
    
    async updateLastDayOff() {
        const inputDate = document.getElementById('lastDayOff').value;
        if (inputDate) {
            this.lastDayOff = new Date(inputDate);
            this.renderCalendarWithAnimation();
            await this.saveCurrentData();
            this.showUpdateFeedback();
        }
    }
    
    showUpdateFeedback() {
        const button = document.getElementById('updateSchedule');
        const originalText = button.textContent;
        
        button.textContent = '✓ Atualizado!';
        button.style.background = '#16a34a';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '';
        }, 2000);
    }
    
    calculateShiftType(date) {
        if (!this.lastDayOff) return 'work-day';
        
        const diffTime = date.getTime() - this.lastDayOff.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const cyclePosition = ((diffDays % 6) + 6) % 6;
        
        if (diffDays === 0) return 'day-off';
        return cyclePosition === 0 ? 'day-off' : 'work-day';
    }
    
    generateScheduleText() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let schedule = `🗓️ *ESCALA 5x1 - ${this.monthNames[month].toUpperCase()} ${year}*\n`;
        schedule += `🏢 *TS LOGÍSTICA - PGM51*\n\n`;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const shiftType = this.calculateShiftType(date);
            const dayName = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][date.getDay()];
            const status = shiftType === 'day-off' ? '🟢 FOLGA' : '🔵 TRABALHO';
            
            schedule += `${day.toString().padStart(2, '0')}/${(month + 1).toString().padStart(2, '0')} (${dayName}) - ${status}\n`;
        }
        
        schedule += `\n📱 *Gerado pelo App TS Logística*`;
        return schedule;
    }
    
    shareWhatsApp() {
        const scheduleText = this.generateScheduleText();
        const encodedText = encodeURIComponent(scheduleText);
        const whatsappUrl = `https://wa.me/?text=${encodedText}`;
        
        if (navigator.share) {
            navigator.share({
                title: 'Escala 5x1 - TS Logística',
                text: scheduleText
            }).catch(err => {
                window.open(whatsappUrl, '_blank');
            });
        } else {
            window.open(whatsappUrl, '_blank');
        }
        
        this.showToast('Abrindo WhatsApp para compartilhar...', 'success');
    }
    
    renderCalendar() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        const monthElement = document.getElementById('currentMonth');
        monthElement.style.opacity = '0';
        monthElement.style.transform = 'translateY(-10px)';
        
        setTimeout(() => {
            monthElement.textContent = `${this.monthNames[month]} ${year}`;
            monthElement.style.opacity = '1';
            monthElement.style.transform = 'translateY(0)';
        }, 150);
        
        this.generateCalendarDays(year, month);
    }
    
    renderCalendarWithAnimation() {
        const calendarDays = document.getElementById('calendarDays');
        calendarDays.classList.add('fade-in');
        
        setTimeout(() => {
            this.renderCalendar();
            calendarDays.classList.remove('fade-in');
        }, 100);
    }
    
    generateCalendarDays(year, month) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        
        const dayOfWeek = firstDay.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        
        const calendarDays = document.getElementById('calendarDays');
        calendarDays.innerHTML = '';
        
        const today = new Date();
        const currentDate = new Date(startDate);
        
        for (let i = 0; i < 42; i++) {
            const dayElement = this.createDayElement(currentDate, month, today, i);
            calendarDays.appendChild(dayElement);
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }
    
    createDayElement(currentDate, month, today, index) {
        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        dayElement.textContent = currentDate.getDate();
        dayElement.style.animationDelay = `${index * 20}ms`;
        
        dayElement.setAttribute('role', 'gridcell');
        dayElement.setAttribute('tabindex', '0');
        
        if (currentDate.getMonth() !== month) {
            dayElement.classList.add('other-month');
            dayElement.setAttribute('aria-label', `${currentDate.getDate()} de ${this.monthNames[currentDate.getMonth()]} (mês anterior/próximo)`);
        } else {
            const shiftType = this.calculateShiftType(currentDate);
            dayElement.classList.add(shiftType);
            
            const shiftLabel = shiftType === 'day-off' ? 'Folga' : 'Trabalho';
            dayElement.setAttribute('aria-label', `${currentDate.getDate()} de ${this.monthNames[month]}, ${shiftLabel}`);
            dayElement.title = `${currentDate.getDate()}/${month + 1}/${currentDate.getFullYear()} - ${shiftLabel}`;
        }
        
        if (this.isSameDay(currentDate, today)) {
            dayElement.classList.add('today');
            dayElement.setAttribute('aria-current', 'date');
        }
        
        dayElement.addEventListener('click', () => {
            this.selectDate(new Date(currentDate));
        });
        
        dayElement.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                this.selectDate(new Date(currentDate));
                e.preventDefault();
            }
        });
        
        return dayElement;
    }
    
    selectDate(date) {
        const dateString = date.toISOString().split('T')[0];
        document.getElementById('lastDayOff').value = dateString;
        this.updateLastDayOff();
        this.highlightSelectedDate(date);
    }
    
    highlightSelectedDate(date) {
        const allDays = document.querySelectorAll('.calendar-day');
        allDays.forEach(day => {
            const dayNumber = parseInt(day.textContent);
            if (dayNumber === date.getDate() && !day.classList.contains('other-month')) {
                day.style.transform = 'scale(1.1)';
                day.style.boxShadow = '0 10px 30px rgba(79, 172, 254, 0.4)';
                
                setTimeout(() => {
                    day.style.transform = '';
                    day.style.boxShadow = '';
                }, 1000);
            }
        });
    }
    
    isSameDay(date1, date2) {
        return date1.getDate() === date2.getDate() &&
               date1.getMonth() === date2.getMonth() &&
               date1.getFullYear() === date2.getFullYear();
    }
}

// Inicializar o calendário quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    new ShiftCalendar();
});
