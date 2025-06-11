// public/app.js (Complete and Layout-Corrected Version)

const app = {
    state: {
        loggedIn: false,
        activeOrders: [],
        historicalOrders: [],
        currentPage: 'loading', // loading, login, orders, bomManagement, history
        currentOrderId: null,
        historyViewMode: 'grid',
        historySortOrder: 'desc',
    },

    init() {
        this.checkSession();
        // Use event delegation for dynamically added elements
        document.body.addEventListener('click', this.handleClicks.bind(this));
        document.body.addEventListener('submit', this.handleSubmit.bind(this));
        window.addEventListener('hashchange', this.router.bind(this));
    },

    async checkSession() {
        try {
            const response = await fetch('/api/session');
            const data = await response.json();
            this.state.loggedIn = data.loggedIn;
            if (this.state.loggedIn) {
                await this.fetchOrders();
            }
        } catch (error) {
            console.error('Session check failed:', error);
            this.state.loggedIn = false;
        } finally {
            this.router();
        }
    },

    async fetchOrders() {
        try {
            const res = await fetch('/api/orders');
            if (!res.ok) throw new Error('加载订单失败');
            const orders = await res.json();
            const processedOrders = orders.map(o => ({
                ...o,
                createdAt: new Date(o.createdAt),
                completedAt: o.completedAt ? new Date(o.completedAt) : null,
                terminatedAt: o.terminatedAt ? new Date(o.terminatedAt) : null,
            }));
            this.state.activeOrders = processedOrders.filter(o => o.status === '进行中');
            this.state.historicalOrders = processedOrders.filter(o => o.status !== '进行中');
        } catch (error) {
            console.error(error);
            this.showModal('错误', error.message);
        }
    },

    router() {
        const hash = window.location.hash.slice(1);
        const [page, param] = hash.split('/');
        
        let newPage = this.state.loggedIn ? 'orders' : 'login';

        if (this.state.loggedIn) {
            if (page === 'order' && param) newPage = 'bomManagement';
            else if (page === 'history') newPage = 'history';
        }
        
        this.state.currentOrderId = param || null;
        this.state.currentPage = newPage;
        this.render();
    },

    render() {
        const appContainer = document.getElementById('app');
        if (!appContainer) return;
        
        // Dynamically adjust container classes for proper layout
        if (this.state.currentPage === 'login' || this.state.currentPage === 'loading') {
            appContainer.className = 'min-h-screen flex flex-col justify-center items-center';
        } else {
            appContainer.className = ''; // Remove centering for main app pages
        }
        
        appContainer.innerHTML = ''; 
        
        switch(this.state.currentPage) {
            case 'login':
                appContainer.innerHTML = this.renderLoginPage();
                break;
            case 'orders':
                appContainer.innerHTML = this.renderOrdersPage();
                break;
            case 'history':
                appContainer.innerHTML = this.renderHistoryPage();
                break;
            case 'bomManagement':
                appContainer.innerHTML = this.renderBomManagementPage();
                const order = this.getOrderById(this.state.currentOrderId);
                if (order && order.boms?.length > 0) {
                   this.renderBomOutput(order.boms.length - 1);
                } else if (order) {
                   this.addMaterialRow(undefined, order.status !== '进行中');
                }
                break;
            default:
                 appContainer.innerHTML = `<div class="text-center">
                    <div class="spinner" style="width:40px; height:40px; border-width:4px;"></div>
                    <p class="mt-4 text-gray-600">正在连接服务器...</p>
                </div>`;
        }
    },

    // Event Delegation Handlers
    handleClicks(e) {
        if (e.target.id === 'signupBtn') {
            const form = e.target.closest('form');
            if (form) this.handleSignup({ preventDefault: () => {}, target: form });
        } else if (e.target.closest('[data-action]')) {
            const target = e.target.closest('[data-action]');
            const { action, id, value } = target.dataset;
            
            e.preventDefault(); // Prevent default link behavior for cleaner routing
            
            switch(action) {
                case 'logout': this.handleLogout(); break;
                case 'create-order-modal': this.showCreateOrderModal(); break;
                case 'complete-order': this.completeOrder(id); break;
                case 'terminate-order': this.terminateOrder(id); break;
                case 'export-excel': this.exportToExcel(); break;
                case 'save-new-version': this.saveNewVersion(); break;
                case 'add-material-row': this.addMaterialRow(undefined, value === 'true'); break;
                case 'remove-material-row': document.getElementById(id)?.remove(); break;
                case 'toggle-history-view': this.toggleHistoryView(value); break;
                case 'toggle-history-sort': this.toggleHistorySortOrder(); break;
            }
        }
    },

    handleSubmit(e) {
        if (e.target.id === 'loginForm') {
            this.handleLogin(e);
        }
    },

    // Auth Methods
    async handleLogin(e) {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '登录失败');
            }
            this.state.loggedIn = true;
            await this.fetchOrders();
            window.location.hash = '';
            this.router();
        } catch (error) {
            this.showModal('登录失败', error.message);
        }
    },

    async handleSignup(e) {
        e.preventDefault();
        const email = e.target.email.value;
        const password = e.target.password.value;
        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '注册失败');
            }
            this.state.loggedIn = true;
            await this.fetchOrders();
            window.location.hash = '';
            this.router();
        } catch (error) {
            this.showModal('注册失败', error.message);
        }
    },
    
    async handleLogout() {
        await fetch('/api/logout', { method: 'POST' });
        this.state.loggedIn = false;
        this.state.activeOrders = [];
        this.state.historicalOrders = [];
        window.location.hash = '';
        this.router();
    },

    // Order Methods
    getOrderById(orderId) {
        return [...this.state.activeOrders, ...this.state.historicalOrders].find(o => o.id == orderId);
    },

    async createNewOrder() {
        const orderNumber = document.getElementById('newOrderNumber').value.trim();
        const clientName = document.getElementById('newClientName').value.trim();

        if (!orderNumber || !clientName) {
            return this.showModal("创建失败", "订单号和客户名称不能为空。");
        }

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumber, clientName })
            });
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || '创建订单失败');
            }
            await this.fetchOrders();
            this.closeModal();
            this.render();
        } catch (error) {
            this.showModal("创建失败", error.message);
        }
    },
    
    async archiveOrder(orderId, status) {
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            if (!res.ok) throw new Error('更新订单状态失败');
            await this.fetchOrders();
            this.render();
        } catch(error) {
            this.showModal('操作失败', error.message);
        }
    },

    terminateOrder(orderId) {
        this.showModal("确认终止订单", "确定要终止此订单吗？订单将被移至历史记录。", "确认终止", async () => {
            await this.archiveOrder(orderId, '订单终止');
            this.closeModal();
        }, true);
    },

    completeOrder(orderId) {
        this.archiveOrder(orderId, '已完成');
    },
    
    toggleHistoryView(mode) {
        if (this.state.historyViewMode === mode) return;
        this.state.historyViewMode = mode;
        this.render();
    },

    toggleHistorySortOrder() {
        this.state.historySortOrder = this.state.historySortOrder === 'desc' ? 'asc' : 'desc';
        this.render();
    },

    // BOM Methods
    async saveNewVersion() {
        const order = this.getOrderById(this.state.currentOrderId);
        if (!order || order.status !== '进行中') return;

        const bomData = {};
        const form = document.getElementById('bomForm');
        bomData.styleNumber = form.elements['styleNumber'].value || '未填写';
        bomData.productName = form.elements['productName'].value || '未填写';
        bomData.designer = form.elements['designer'].value || '未填写';
        bomData.imageUrl = form.elements['productImage'].value;
        bomData.materials = this.getMaterialsFromForm();

        if (bomData.materials.length === 0) return this.showModal("错误", "无法保存空BOM。");

        bomData.totalCost = bomData.materials.reduce((acc, mat) => acc + mat.cost, 0);
        bomData.version = (order.boms?.length || 0) + 1;
        bomData.createdAt = new Date().toISOString();

        const updatedBoms = [...(order.boms || []), bomData];
        
        try {
            const res = await fetch(`/api/orders/${this.state.currentOrderId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boms: updatedBoms })
            });
            if (!res.ok) throw new Error('保存新版本失败');
            
            order.boms = updatedBoms;
            this.renderBomOutput(order.boms.length - 1);
        } catch (error) {
            this.showModal('保存失败', error.message);
        }
    },

    renderBomOutput(versionIndex) {
        const order = this.getOrderById(this.state.currentOrderId);
        const bomWrapper = document.getElementById('bomOutputWrapper');
        if (!order || !bomWrapper || !order.boms) return;

        const bomData = order.boms[versionIndex];
        const prevBomData = versionIndex > 0 ? order.boms[versionIndex - 1] : null;
        const versionOptions = order.boms.map((v, i) => `<option value="${i}" ${i == versionIndex ? 'selected' : ''}>版本 ${v.version} (${new Date(v.createdAt).toLocaleString('zh-CN')})</option>`).join('');

        bomWrapper.innerHTML = `
            <div id="bomOutput" class="p-4 sm:p-6">
                <div class="no-print flex justify-between items-center mb-4 gap-4">
                     <div class="flex items-center space-x-2">
                        <label for="versionSelector" class="font-semibold text-sm">BOM版本:</label>
                        <select id="versionSelector" onchange="app.renderBomOutput(this.value)" class="p-2 border rounded-md text-sm">${versionOptions}</select>
                    </div>
                    <button data-action="export-excel" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg flex items-center space-x-2 text-sm">
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-file-spreadsheet"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 11h8v4H8z"/><path d="M11 11v4"/><path d="M11 17h2"/></svg>
                       <span>导出为Excel</span>
                    </button>
                </div>
                <div id="bom-header-${versionIndex}" class="flex justify-between items-start mb-6 border-b pb-4">
                    <div>
                        <h2 class="text-2xl font-bold text-gray-900 product-name">${bomData.productName} - V${bomData.version}</h2>
                        <p class="text-gray-600">款号: <span class="style-number">${bomData.styleNumber}</span></p>
                        <p class="text-gray-600">设计师: <span class="designer">${bomData.designer}</span></p>
                    </div>
                    ${bomData.imageUrl ? `<img src="${bomData.imageUrl}" alt="款式图片" class="w-32 h-32 object-cover rounded-lg shadow-md border">` : '<div class="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">无图片</div>'}
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm text-left text-gray-600">
                         <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                            <tr>
                                <th class="px-4 py-3">物料名称</th><th class="px-4 py-3">供应商</th><th class="px-4 py-3">颜色</th>
                                <th class="px-4 py-3 text-right">用量</th><th class="px-4 py-3">单位</th><th class="px-4 py-3 text-right">单价 (¥)</th><th class="px-4 py-3 text-right">成本 (¥)</th>
                            </tr>
                        </thead>
                        <tbody>${(bomData.materials || []).map(mat => {
                            const prevMat = prevBomData?.materials?.find(pm => pm.name === mat.name) || {};
                            return `<tr class="bg-white border-b">
                                <td class="px-4 py-3 font-medium text-gray-900 ${mat.name !== prevMat.name ? 'highlight-diff' : ''}">${mat.name}</td>
                                <td class="px-4 py-3 ${mat.supplier !== prevMat.supplier ? 'highlight-diff' : ''}">${mat.supplier}</td>
                                <td class="px-4 py-3 ${mat.color !== prevMat.color ? 'highlight-diff' : ''}">${mat.color}</td>
                                <td class="px-4 py-3 text-right ${mat.quantity !== prevMat.quantity ? 'highlight-diff' : ''}">${mat.quantity}</td>
                                <td class="px-4 py-3 ${mat.unit !== prevMat.unit ? 'highlight-diff' : ''}">${mat.unit}</td>
                                <td class="px-4 py-3 text-right ${mat.unitPrice !== prevMat.unitPrice ? 'highlight-diff' : ''}">${(mat.unitPrice || 0).toFixed(2)}</td>
                                <td class="px-4 py-3 text-right font-semibold">${(mat.cost || 0).toFixed(2)}</td>
                            </tr>`;
                        }).join('')}</tbody>
                        <tfoot><tr class="font-semibold text-gray-900 bg-gray-100">
                            <td colspan="6" class="px-4 py-3 text-right text-base">总计物料成本</td>
                            <td class="px-4 py-3 text-right text-base">¥ ${(bomData.totalCost || 0).toFixed(2)}</td>
                        </tr></tfoot>
                    </table>
                </div>
            </div>`;
        if (!document.hidden) {
            bomWrapper.scrollIntoView({ behavior: 'smooth' });
        }
    },
    
    exportToExcel() {
        const order = this.getOrderById(this.state.currentOrderId);
        if (!order) return;
        const versionSelector = document.getElementById('versionSelector');
        if (!versionSelector) { this.showModal("导出失败", "找不到BOM版本选择器。"); return; }
        const versionIndex = versionSelector.value;
        const bomData = order.boms[versionIndex];
        if (!bomData) { this.showModal("导出失败", "没有可导出的BOM数据。"); return; }
        const headers = ["物料名称", "供应商", "颜色", "用量", "单位", "单价 (¥)", "成本 (¥)"];
        let csvContent = "\uFEFF";
        csvContent += headers.join(",") + "\r\n";
        (bomData.materials || []).forEach(mat => {
            const row = [`"${String(mat.name || '').replace(/"/g, '""')}"`, `"${String(mat.supplier || '').replace(/"/g, '""')}"`, `"${String(mat.color || '').replace(/"/g, '""')}"`, mat.quantity, `"${String(mat.unit || '').replace(/"/g, '""')}"`, (mat.unitPrice || 0).toFixed(2), (mat.cost || 0).toFixed(2)];
            csvContent += row.join(",") + "\r\n";
        });
        csvContent += `\r\n`;
        csvContent += `,,,,,"总计物料成本",${(bomData.totalCost || 0).toFixed(2)}\r\n`;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        const fileName = `BOM_${order.orderNumber}_V${bomData.version}.csv`;
        link.setAttribute("download", fileName);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    // UI Renderers
    renderLoginPage() {
        return `
            <div class="w-full max-w-md mx-auto p-8 fade-in">
                <div class="bg-white rounded-2xl shadow-xl p-8">
                    <div class="flex flex-col items-center mb-6">
                        <div class="bg-indigo-600 text-white p-3 rounded-full mb-4">
                           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clipboard-list"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>
                        </div>
                        <h1 class="text-2xl font-bold text-gray-900">BOM管理系统</h1>
                        <p class="text-gray-500 mt-1">请登录或注册以继续</p>
                    </div>
                    <form id="loginForm" class="space-y-4">
                        <div><label for="email" class="block text-sm font-medium text-gray-700">邮箱</label><input type="email" name="email" id="email" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></div>
                        <div><label for="password" class="block text-sm font-medium text-gray-700">密码</label><input type="password" name="password" id="password" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"></div>
                        <div class="flex items-center justify-between pt-2 gap-3">
                            <button type="submit" id="loginBtn" class="w-full flex justify-center py-2 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">登录</button>
                            <button type="button" id="signupBtn" class="w-full flex justify-center py-2 px-4 rounded-md shadow-sm text-sm font-medium text-indigo-600 border border-indigo-600 bg-white hover:bg-indigo-50">注册</button>
                        </div>
                    </form>
                </div>
            </div>`;
    },
    renderOrdersPage() {
        const orderCards = this.state.activeOrders.map(order => `
            <div class="bg-white rounded-xl shadow-md p-5 border border-gray-200 flex flex-col justify-between fade-in">
                <div>
                    <div class="flex justify-between items-start mb-4">
                         <span class="px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">${order.status}</span>
                        <span class="text-sm text-gray-500">${order.createdAt.toLocaleDateString()}</span>
                    </div>
                    <h3 class="text-lg font-bold text-gray-900">${order.orderNumber}</h3>
                    <p class="text-gray-600">${order.clientName}</p>
                </div>
                <div class="mt-5 pt-4 border-t flex flex-col space-y-2">
                    <a href="#order/${order.id}" class="w-full text-center bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg text-sm">管理BOM</a>
                    <div class="flex space-x-2">
                       <button data-action="complete-order" data-id="${order.id}" class="w-1/2 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm">完成订单</button>
                       <button data-action="terminate-order" data-id="${order.id}" class="w-1/2 bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm">终止订单</button>
                    </div>
                </div>
            </div>`).join('');

        return `
            <div class="container mx-auto p-4 sm:p-6 lg:p-8">
                <header class="flex flex-wrap justify-between items-center mb-8 gap-4">
                    <div class="flex items-center space-x-3">
                         <div class="bg-indigo-600 text-white p-3 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg></div>
                         <h1 class="text-3xl font-bold text-gray-900">进行中订单</h1>
                    </div>
                    <div class="flex items-center space-x-3">
                       <a href="#history" class="text-gray-600 hover:text-indigo-600 font-semibold py-2 px-4 rounded-lg flex items-center space-x-2">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          <span>历史订单</span>
                       </a>
                       <button data-action="create-order-modal" class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2">
                           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-plus-circle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                           <span>创建新订单</span>
                       </button>
                        <button data-action="logout" class="text-gray-600 hover:text-red-600 font-semibold py-2 px-4 rounded-lg flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-log-out"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            <span>登出</span>
                       </button>
                    </div>
                </header>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    ${this.state.activeOrders.length > 0 ? orderCards : '<p class="text-gray-500 col-span-full text-center py-10">没有进行中的订单。</p>'}
                </div>
            </div>`;
    },
    renderHistoryPage() {
        // This function is now complete and correct
        const sortBtnText = this.state.historySortOrder === 'desc' ? '按时间倒序' : '按时间正序';
        const sortIcon = this.state.historySortOrder === 'desc' 
                ? `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-down-wide-narrow"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/></svg>`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-up-wide-narrow"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/><path d="M11 12h10"/><path d="M11 16h7"/><path d="M11 20h4"/></svg>`;

        const gridBtnClasses = this.state.historyViewMode === 'grid' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100';
        const listBtnClasses = this.state.historyViewMode === 'list' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100';
        
        const sortedOrders = [...this.state.historicalOrders].sort((a, b) => {
            const dateA = a.completedAt || a.terminatedAt;
            const dateB = b.completedAt || b.terminatedAt;
            if (!dateA || !dateB) return 0;
            return this.state.historySortOrder === 'desc' ? dateB - dateA : dateA - dateB;
        });

        const contentHtml = this.state.historyViewMode === 'grid' ? this.renderHistoryGrid(sortedOrders) : this.renderHistoryList(sortedOrders);

        return `
            <div class="container mx-auto p-4 sm:p-6 lg:p-8">
                <header class="flex flex-wrap justify-between items-center mb-8 gap-4">
                    <div class="flex items-center space-x-3">
                         <div class="bg-gray-500 text-white p-3 rounded-lg"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-history"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></div>
                         <h1 class="text-3xl font-bold text-gray-900">历史订单</h1>
                    </div>
                    <a href="#" class="text-gray-600 hover:text-indigo-600 font-semibold py-2 px-4 rounded-lg flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-left"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
                        <span>返回进行中订单</span>
                    </a>
                </header>
                <div class="no-print flex flex-wrap justify-between items-center mb-6 p-4 bg-gray-200 rounded-lg gap-4">
                    <div class="flex items-center">
                        <span class="text-sm font-semibold mr-3 text-gray-700">查看方式:</span>
                        <div class="flex rounded-lg shadow-sm">
                           <button data-action="toggle-history-view" data-value="grid" class="px-3 py-2 rounded-l-lg border border-gray-300 ${gridBtnClasses} text-sm flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-layout-grid"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg> 网格</button>
                           <button data-action="toggle-history-view" data-value="list" class="px-3 py-2 rounded-r-lg border border-gray-300 border-l-0 ${listBtnClasses} text-sm flex items-center gap-2"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg> 列表</button>
                        </div>
                    </div>
                     <button data-action="toggle-history-sort" class="flex items-center gap-2 text-sm font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-2 rounded-lg shadow-sm">
                       ${sortIcon}
                       <span>${sortBtnText}</span>
                     </button>
                </div>
                ${contentHtml}
            </div>
        `;
    },
    renderHistoryGrid(orders) {
        if (orders.length === 0) return '<p class="text-gray-500 col-span-full text-center py-10">没有历史订单记录。</p>';
        return `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            ${orders.map(order => this.renderHistoryCard(order)).join('')}
        </div>`;
    },
    renderHistoryCard(order) {
        const statusColor = order.status === '已完成' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
        const finalDate = order.completedAt || order.terminatedAt;
        return `
            <div class="bg-white rounded-xl shadow-sm p-5 border border-gray-200 flex flex-col justify-between fade-in opacity-90 hover:shadow-lg transition-shadow">
                <div>
                    <div class="flex justify-between items-start mb-4">
                        <span class="px-3 py-1 text-xs font-semibold rounded-full ${statusColor}">${order.status}</span>
                        <span class="text-sm text-gray-500">${finalDate ? finalDate.toLocaleDateString() : ''}</span>
                    </div>
                    <h3 class="text-lg font-bold text-gray-700">${order.orderNumber}</h3>
                    <p class="text-gray-500">${order.clientName}</p>
                </div>
                <div class="mt-5 pt-4 border-t">
                    <a href="#order/${order.id}" class="w-full text-center bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg text-sm">查看BOM</a>
                </div>
            </div>`;
    },
    renderHistoryList(orders) {
         if (orders.length === 0) return '<p class="text-gray-500 col-span-full text-center py-10">没有历史订单记录。</p>';
         return `<div class="bg-white rounded-xl shadow-md overflow-x-auto">
            <table class="w-full text-sm text-left">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">订单号</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">客户</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">归档日期</th>
                        <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${orders.map(order => {
                        const statusColor = order.status === '已完成' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
                        const finalDate = order.completedAt || order.terminatedAt;
                        return `
                        <tr>
                            <td class="px-6 py-4 font-medium text-gray-900">${order.orderNumber}</td>
                            <td class="px-6 py-4 text-gray-600">${order.clientName}</td>
                            <td class="px-6 py-4"><span class="px-3 py-1 text-xs font-semibold rounded-full ${statusColor}">${order.status}</span></td>
                            <td class="px-6 py-4 text-gray-600">${finalDate ? finalDate.toLocaleDateString() : 'N/A'}</td>
                            <td class="px-6 py-4"><a href="#order/${order.id}" class="text-indigo-600 hover:text-indigo-900 font-semibold">查看BOM</a></td>
                        </tr>
                        `
                    }).join('')}
                </tbody>
            </table>
         </div>`;
    },
    renderBomManagementPage() {
        // ... (Same as before with minor tweaks for history link and disabled state)
        const order = this.getOrderById(this.state.currentOrderId);
        if (!order) return '<p class="text-center p-8">错误：找不到该订单。</p>';
        
        const isArchived = order.status !== '进行中';
        const lastBom = order.boms?.length > 0 ? order.boms[order.boms.length - 1] : {};
        const archiveNotice = isArchived ? `<div class="no-print bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6 rounded-md" role="alert"><p><b>只读模式</b>: 此订单已归档 (${order.status})，无法编辑。</p></div>` : '';

        return `
            <div class="container mx-auto p-4 sm:p-6 lg:p-8">
                 <header class="no-print flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                    <div class="flex items-center space-x-3">
                        <a href="${isArchived ? '#history' : '#'}" class="bg-gray-200 hover:bg-gray-300 p-2 rounded-lg">返回</a>
                        <div>
                            <h1 class="text-2xl font-bold">管理订单: ${order.orderNumber}</h1>
                            <p class="text-gray-600">${order.clientName}</p>
                        </div>
                    </div>
                    <button onclick="window.print()" class="no-print bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">打印当前BOM</button>
                </header>
                ${archiveNotice}
                <main class="grid grid-cols-1 ${order.boms?.length > 0 ? 'lg:grid-cols-2' : 'lg:grid-cols-1'} gap-8">
                    <div class="no-print bg-white p-6 rounded-xl shadow-md">
                         <fieldset ${isArchived ? 'disabled' : ''}>
                            <h2 class="text-xl font-semibold mb-4">1. 款式信息</h2>
                            <form id="bomForm" class="space-y-4">
                                <div><label>款号</label><input type="text" id="styleNumber" name="styleNumber" value="${lastBom.styleNumber || ''}" class="w-full p-2 border rounded disabled:bg-gray-100"></div>
                                <div><label>品名</label><input type="text" id="productName" name="productName" value="${lastBom.productName || ''}" class="w-full p-2 border rounded disabled:bg-gray-100"></div>
                                <div><label>设计师</label><input type="text" id="designer" name="designer" value="${lastBom.designer || ''}" class="w-full p-2 border rounded disabled:bg-gray-100"></div>
                                <div><label>款式图片URL</label><input type="url" id="productImage" name="productImage" value="${lastBom.imageUrl || ''}" class="w-full p-2 border rounded disabled:bg-gray-100"></div>
                            </form>
                            <hr class="my-6">
                            <h2 class="text-xl font-semibold mb-4">2. 物料明细</h2>
                            <div id="materialsContainer" class="space-y-3">${lastBom.materials ? lastBom.materials.map(mat => this.getMaterialRowHtml(mat, isArchived)).join('') : ''}</div>
                            <button data-action="add-material-row" data-value="${isArchived}" class="mt-4 w-full bg-gray-200 py-2 rounded disabled:opacity-50">添加物料</button>
                            <hr class="my-6">
                            <button data-action="save-new-version" class="w-full bg-green-600 text-white font-bold py-3 rounded-lg disabled:opacity-50">保存为新BOM版本</button>
                         </fieldset>
                    </div>
                    <div id="bomOutputWrapper" class="bg-white rounded-xl shadow-lg ${order.boms?.length === 0 ? 'hidden' : ''}"></div>
                </main>
            </div>`;
    },

    // Modal and Helper functions
    showCreateOrderModal() {
        this.showModal("创建新订单", 
            `<div>
                <div class="mb-4"><label for="newOrderNumber" class="block text-left">订单号</label><input type="text" id="newOrderNumber" class="mt-1 w-full p-2 border rounded" placeholder="例如：PO-2025-001"></div>
                <div><label for="newClientName" class="block text-left">客户名称</label><input type="text" id="newClientName" class="mt-1 w-full p-2 border rounded" placeholder="例如：Zara"></div>
            </div>`, "创建订单", this.createNewOrder.bind(this), true);
    },
    showModal(title, message, buttonText = "确认", callback = null, showCancel = false) {
        const container = document.getElementById('modal-container');
        const cancelButtonHtml = showCancel ? `<button id="modal-cancel" class="w-full sm:w-auto mt-2 sm:mt-0 bg-gray-200 px-6 py-2 rounded-lg">取消</button>` : '';
        container.innerHTML = `
            <div id="custom-modal" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                    <h3 class="text-lg font-bold mb-4">${title}</h3>
                    <div id="modal-message" class="mb-6 text-gray-700">${message}</div>
                    <div class="flex flex-col sm:flex-row-reverse gap-3">
                       <button id="modal-action" class="w-full sm:w-auto bg-indigo-600 text-white px-6 py-2 rounded-lg">${buttonText}</button>
                       ${cancelButtonHtml}
                    </div>
                </div>
            </div>`;
        document.getElementById('modal-action').onclick = callback ? callback : this.closeModal.bind(this);
        if (showCancel) document.getElementById('modal-cancel').onclick = this.closeModal.bind(this);
    },
    closeModal() {
        const modal = document.getElementById('custom-modal');
        if (modal) modal.remove();
    },
    addMaterialRow(material = {}, disabled = false) {
        const container = document.getElementById('materialsContainer');
        if(!container) return;
        container.insertAdjacentHTML('beforeend', this.getMaterialRowHtml(material, disabled));
    },
    getMaterialRowHtml(material = {}, disabled = false) {
        const id = `mat-${Date.now()}-${Math.random()}`;
        const disabledAttr = disabled ? 'disabled' : '';
        return `<div id="${id}" class="grid grid-cols-12 gap-2 items-center">
            <input name="materialName" class="col-span-3 p-1 border-b disabled:bg-gray-100" placeholder="物料名称" value="${material.name || ''}" ${disabledAttr}>
            <input name="supplier" class="col-span-2 p-1 border-b disabled:bg-gray-100" placeholder="供应商" value="${material.supplier || ''}" ${disabledAttr}>
            <input name="color" class="col-span-2 p-1 border-b disabled:bg-gray-100" placeholder="颜色" value="${material.color || ''}" ${disabledAttr}>
            <input type="number" name="quantity" class="col-span-1 p-1 border-b disabled:bg-gray-100" placeholder="用量" value="${material.quantity || ''}" ${disabledAttr}>
            <input name="unit" class="col-span-1 p-1 border-b disabled:bg-gray-100" placeholder="单位" value="${material.unit || '件'}" ${disabledAttr}>
            <input type="number" name="unitPrice" class="col-span-2 p-1 border-b disabled:bg-gray-100" placeholder="单价" value="${(material.unitPrice || 0).toFixed(2)}" ${disabledAttr}>
            ${!disabled ? `<button data-action="remove-material-row" data-id="${id}" class="col-span-1 text-red-500">X</button>` : '<div class="col-span-1"></div>'}
        </div>`;
    },
    getMaterialsFromForm() {
        const materials = [];
        document.querySelectorAll('#materialsContainer > div').forEach(row => {
            const materialName = row.querySelector('[name="materialName"]').value;
            if (!materialName) return;
            const quantity = parseFloat(row.querySelector('[name="quantity"]').value) || 0;
            const unitPrice = parseFloat(row.querySelector('[name="unitPrice"]').value) || 0;
            materials.push({name: materialName, supplier: row.querySelector('[name="supplier"]').value || '-', color: row.querySelector('[name="color"]').value || '-', quantity, unit: row.querySelector('[name="unit"]').value || '件', unitPrice, cost: quantity * unitPrice});
        });
        return materials;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});