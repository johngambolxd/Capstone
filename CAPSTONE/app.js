const state = {
    user: null,
    customerAccount: null,
    csrf: null,
    inventory: [],
    projects: [],
    sales: [],
    materialUsage: [],
    metrics: {},
    salesChart: [],
    page: 'overview',
    cart: [],
    catalog: { items: [], projects: [] },
    pendingOrderItem: '',
    pendingCheckout: false,
    catalogCategory: 'All products',
    catalogQuery: '',
    catalogSort: 'featured',
    toastTimer: null
};

const byId = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : 'No due date';
const statusClass = (status) => `status-${String(status || '').toLowerCase().replaceAll(' ', '-')}`;

async function api(action, payload = null, method = 'GET') {
    const options = { method, headers: { Accept: 'application/json' } };
    let url = `api.php?action=${encodeURIComponent(action)}`;
    if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        if (state.csrf) options.headers['X-CSRF-Token'] = state.csrf;
        options.body = JSON.stringify({ action, ...payload });
        url = 'api.php';
    }
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
}

function showGate(ownerExists) {
    byId('appShell').hidden = true;
    byId('customerScreen').hidden = true;
    byId('authGate').hidden = false;
    byId('nameField').hidden = ownerExists;
    byId('authEyebrow').textContent = ownerExists ? 'WORKSHOP ACCESS' : 'FIRST-TIME SETUP';
    byId('authTitle').textContent = ownerExists ? 'Welcome back.' : 'Set up your shop.';
    byId('authDescription').textContent = ownerExists ? 'Sign in to open the shop floor.' : 'Create the administrator account for this workshop.';
    byId('authSubmit').innerHTML = ownerExists ? 'Sign in <span>↗</span>' : 'Create account <span>↗</span>';
    byId('authForm').dataset.mode = ownerExists ? 'login' : 'setup';
    byId('authForm').elements.password.autocomplete = ownerExists ? 'current-password' : 'new-password';
}

async function loadState() {
    try {
        const data = await api('state');
        state.user = data.user;
        state.customerAccount = data.customer_account || null;
        state.csrf = data.csrf;
        if (state.customerAccount) {
            loadCart();
            byId('authGate').hidden = true;
            byId('appShell').hidden = true;
            byId('customerScreen').hidden = false;
            updateCustomerAccountButton();
            state.catalog = await api('catalog');
            state.csrf = state.catalog.csrf;
            renderCatalog();
            return;
        }
        if (!state.user) {
            updateCustomerAccountButton();
            if (new URLSearchParams(location.search).get('view') === 'customer') {
                loadCart();
                await openCustomerView();
                return;
            }
            showGate(data.owner_exists);
            return;
        }
        state.inventory = data.inventory || [];
        state.projects = data.projects || [];
        state.sales = data.sales || [];
        state.materialUsage = data.material_usage || [];
        state.metrics = data.metrics || {};
        state.salesChart = data.sales_chart || [];
        byId('authGate').hidden = true;
        byId('customerScreen').hidden = true;
        byId('appShell').hidden = false;
        updateCustomerAccountButton();
        byId('userName').textContent = state.user.name;
        byId('userInitial').textContent = state.user.name.trim().charAt(0).toUpperCase();
        byId('todayDate').textContent = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase();
        const lowCount = Number(state.metrics.low_stock || 0);
        byId('lowStockBadge').hidden = lowCount === 0;
        renderPage();
    } catch (error) {
        showGate(false);
        byId('authError').textContent = error.message;
    }
}

function pageHeading(title, description, action = '') {
    return `<div class="page-heading"><div><p class="eyebrow">RP METAL FABRICATION · WORKSPACE</p><h1>${title}</h1><p>${description}</p></div>${action ? `<div class="heading-actions">${action}</div>` : ''}</div>`;
}

function renderPage() {
    document.querySelectorAll('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === state.page));
    const labels = { overview: 'OVERVIEW', pos: 'POINT OF SALE', inventory: 'INVENTORY', projects: 'PROJECTS', sales: 'SALES HISTORY' };
    byId('pageCrumb').textContent = labels[state.page] || 'OVERVIEW';
    const views = { overview: renderOverview, pos: renderPos, inventory: renderInventory, projects: renderProjects, sales: renderSales };
    byId('pageContent').innerHTML = (views[state.page] || renderOverview)();
}

function renderOverview() {
    const metrics = state.metrics;
    const dates = new Map(state.salesChart.map((entry) => [entry.day, Number(entry.total)]));
    const chartDays = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - index));
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        return { label: new Intl.DateTimeFormat('en-PH', { weekday: 'short' }).format(date), total: dates.get(key) || 0 };
    });
    const max = Math.max(...chartDays.map((day) => day.total), 1);
    const lowItems = state.inventory.filter((item) => Number(item.quantity) <= Number(item.reorder_level));
    const activeProjects = state.projects.filter((project) => project.status !== 'Completed').slice(0, 4);
    const materialUsage = state.materialUsage.length ? state.materialUsage.map((item) => `<div class="low-stock-row"><strong>${escapeHtml(item.name)}</strong><span>${Number(item.quantity)} ${escapeHtml(item.unit)}</span></div>`).join('') : '<div class="empty-state">No material use recorded in the last 7 days.</div>';
    const chart = chartDays.map((day) => `<div class="chart-col"><div class="chart-bar" title="${escapeHtml(money(day.total))}" style="height:${Math.max(day.total ? 8 : 2, (day.total / max) * 100)}%"></div><span class="chart-label">${day.label}</span></div>`).join('');
    const recent = activeProjects.length ? activeProjects.map((project, index) => `<div class="work-row"><div class="work-marker">${String(index + 1).padStart(2, '0')}</div><div class="work-detail"><strong>${escapeHtml(project.title)}</strong><span>${escapeHtml(project.customer)} · Due ${escapeHtml(shortDate(project.due_date))}</span></div><span class="status-pill ${statusClass(project.status)}">${escapeHtml(project.status)}</span></div>`).join('') : '<div class="empty-state">No active projects. Add the next job when it comes in.</div>';
    const stock = lowItems.length ? lowItems.slice(0, 5).map((item) => `<div class="low-stock-row"><strong>${escapeHtml(item.name)}</strong><span>${Number(item.quantity)} ${escapeHtml(item.unit)} left</span></div>`).join('') : '<div class="empty-state">Stock levels are looking good.</div>';
    return `${pageHeading('A clear shop floor.', 'Here is what is moving through the workshop today.', '<button class="button button-dark" data-action="new-project">＋ &nbsp; New project</button>')}
        <section class="metric-grid" aria-label="Workshop metrics">
            <article class="metric-card"><span class="metric-label">SALES TODAY</span><div class="metric-value">${money(metrics.today_sales)} <span class="metric-change">${Number(metrics.transactions || 0)} ${Number(metrics.transactions) === 1 ? 'SALE' : 'SALES'}</span></div><div class="metric-note">Recorded transactions today</div></article>
            <article class="metric-card"><span class="metric-label">THIS MONTH</span><div class="metric-value">${money(metrics.month_sales)}</div><div class="metric-note">Sales recorded this month</div></article>
            <article class="metric-card"><span class="metric-label">ACTIVE PROJECTS</span><div class="metric-value">${Number(metrics.active_projects || 0).toLocaleString()}</div><div class="metric-note">Jobs in the production queue</div></article>
            <article class="metric-card"><span class="metric-label">INVENTORY AT RISK</span><div class="metric-value">${Number(metrics.low_stock || 0).toLocaleString()} <span class="metric-change">ITEMS</span></div><div class="metric-note">At or below reorder level</div></article>
        </section>
        <div class="overview-grid"><section class="panel"><div class="panel-head"><div><h2>Sales rhythm</h2><p>Recorded revenue · last 7 days</p></div><button class="panel-link" data-page-jump="sales">VIEW SALES ↗</button></div><div class="chart-wrap"><div class="chart">${chart}</div></div></section>
        <section class="panel"><div class="panel-head"><div><h2>On the floor</h2><p>Upcoming and in-progress work</p></div><button class="panel-link" data-page-jump="projects">ALL PROJECTS ↗</button></div><div class="work-list">${recent}</div></section></div>
        <div class="bottom-grid"><section class="panel"><div class="panel-head"><div><h2>Materials to watch</h2><p>${lowItems.length} items at or below their reorder point</p></div><button class="panel-link" data-page-jump="inventory">INVENTORY ↗</button></div><div class="low-stock-list">${stock}</div></section>
        <section class="panel"><div class="panel-head"><div><h2>Material usage</h2><p>Raw materials issued · last 7 days</p></div><span class="project-code">${Number(metrics.usage_events || 0)} USES</span></div><div class="low-stock-list">${materialUsage}</div><div class="metric-card"><span class="metric-label">ESTIMATED STOCK VALUE</span><div class="metric-value">${money(metrics.stock_value)}</div><div class="metric-note">Materials and finished products</div></div></section></div>`;
}

function renderInventory() {
    const rows = state.inventory.map((item) => {
        const low = Number(item.quantity) <= Number(item.reorder_level);
        return `<tr data-inventory-row data-category="${escapeHtml(item.category)}" data-search="${escapeHtml(`${item.name} ${item.sku}`.toLowerCase())}"><td><strong>${escapeHtml(item.name)}</strong><span class="item-sku">${escapeHtml(item.sku)}</span></td><td>${escapeHtml(item.category)}</td><td class="${low ? 'qty-low' : ''}"><strong class="${low ? 'qty-low' : ''}">${Number(item.quantity)} ${escapeHtml(item.unit)}</strong></td><td>${Number(item.reorder_level)} ${escapeHtml(item.unit)}</td><td>${money(item.unit_price)}</td><td><div class="table-actions">${item.category === 'Material' ? `<button class="table-action" data-use-item="${Number(item.id)}">Use</button>` : ''}<button class="table-action" data-edit-item="${Number(item.id)}">Edit</button><button class="table-action" data-delete-item="${Number(item.id)}" aria-label="Delete ${escapeHtml(item.name)}">×</button></div></td></tr>`;
    }).join('');
    return `${pageHeading('Materials & stock.', 'Keep raw materials and finished work in view.', '<button class="button button-dark" data-action="new-inventory">＋ &nbsp; Add item</button>')}
        <div class="toolbar"><input class="filter-input" id="inventorySearch" type="search" placeholder="Search name or SKU…" aria-label="Search inventory"><select class="filter-select" id="inventoryFilter" aria-label="Filter inventory"><option value="all">All stock</option><option value="Material">Materials</option><option value="Product">Finished products</option><option value="low">Low stock only</option></select><span class="inventory-summary">${state.inventory.length} ITEMS</span></div>
        <section class="panel table-wrap"><table class="data-table"><thead><tr><th>ITEM</th><th>TYPE</th><th>ON HAND</th><th>REORDER AT</th><th>UNIT PRICE</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty-state">No inventory has been added yet.</td></tr>'}</tbody></table></section>`;
}

function renderProjects() {
    const pendingCount = state.projects.filter((project) => project.request_status === 'pending').length;
    const cards = state.projects.map((project) => {
        const pending = project.request_status === 'pending';
        const declined = project.request_status === 'declined';
        const requestBadge = pending ? '<span class="status-pill status-requested">New request</span>' : declined ? '<span class="status-pill status-declined">Declined</span>' : `<span class="status-pill ${statusClass(project.status)}">${escapeHtml(project.status)}</span>`;
        const controls = pending
            ? `<div class="request-review"><span>Review the details, then confirm a quote with the customer.</span><div><button class="button button-outline" data-review-request="${Number(project.id)}" data-decision="declined">Decline</button><button class="button button-dark" data-review-request="${Number(project.id)}" data-decision="approved">Approve request</button></div></div>`
            : `<div class="project-controls"><select data-project-status="${Number(project.id)}" aria-label="Update status for ${escapeHtml(project.title)}">${['Queued', 'In progress', 'Finishing', 'Completed'].map((status) => `<option${project.status === status ? ' selected' : ''}>${status}</option>`).join('')}</select><label class="showcase-toggle"><input type="checkbox" data-project-showcase="${Number(project.id)}" ${Number(project.showcase) ? 'checked' : ''} ${project.status !== 'Completed' ? 'disabled' : ''}> Showcase</label></div>`;
        return `<article class="project-card ${pending ? 'project-request-pending' : ''}"><div class="project-card-head"><span class="project-code">${escapeHtml(project.project_code)}</span>${requestBadge}</div><h3>${escapeHtml(project.title)}</h3><div class="project-customer">${escapeHtml(project.customer)}${project.phone ? ` · ${escapeHtml(project.phone)}` : ''}</div><p class="project-details">${escapeHtml(project.details || 'No project notes added.')}</p><div class="project-meta"><span>${pending ? 'CUSTOMER REQUEST' : `DUE ${escapeHtml(shortDate(project.due_date).toUpperCase())}`}</span><span>${escapeHtml(project.updated_at ? new Date(`${project.updated_at.replace(' ', 'T')}Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '')}</span></div>${controls}</article>`;
    }).join('');
    return `${pageHeading('Work in progress.', 'Review customer requests and track confirmed jobs.', '<button class="button button-dark" data-action="new-project">＋ &nbsp; New project</button>')}
        <div class="toolbar"><span class="inventory-summary">${state.projects.length} TOTAL JOBS · ${Number(state.metrics.active_projects || 0)} ACTIVE${pendingCount ? ` · ${pendingCount} REQUEST${pendingCount === 1 ? '' : 'S'} TO REVIEW` : ''}</span></div><div class="project-board">${cards || '<section class="panel empty-state">No projects yet. Add a job to start tracking its progress.</section>'}</div>`;
}

function renderSales() {
    const rows = state.sales.map((sale) => `<tr><td><strong>${escapeHtml(sale.receipt_no)}</strong></td><td>${escapeHtml(sale.customer)}</td><td>${Number(sale.item_count)} ${Number(sale.item_count) === 1 ? 'line' : 'lines'}</td><td><strong>${money(sale.subtotal)}</strong></td><td>${money(sale.payment)}</td><td>${money(sale.change_due)}</td><td>${escapeHtml(new Date(`${sale.created_at.replace(' ', 'T')}Z`).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td></tr>`).join('');
    return `${pageHeading('Sales, accounted for.', 'Every counter sale, one searchable record.', '<button class="button button-dark" data-page-jump="pos">＋ &nbsp; New sale</button>')}
        <div class="metric-grid"><article class="metric-card"><span class="metric-label">TODAY</span><div class="metric-value">${money(state.metrics.today_sales)}</div><div class="metric-note">${Number(state.metrics.transactions || 0)} transactions</div></article><article class="metric-card"><span class="metric-label">THIS MONTH</span><div class="metric-value">${money(state.metrics.month_sales)}</div><div class="metric-note">Sales recorded this month</div></article></div>
        <section class="panel table-wrap" style="margin-top:16px"><table class="data-table"><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>PAYMENT</th><th>CHANGE</th><th>RECORDED</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty-state">No sales recorded yet. Completed sales appear here.</td></tr>'}</tbody></table></section>`;
}

function renderPos() {
    const products = state.inventory.filter((item) => item.category === 'Product');
    const items = products.map((item) => `<button class="pos-item" data-add-cart="${Number(item.id)}" ${Number(item.quantity) <= 0 ? 'disabled' : ''}><span class="pos-item-icon">⌑</span><span class="pos-item-copy"><strong>${escapeHtml(item.name)}</strong><small>${Number(item.quantity)} ${escapeHtml(item.unit)} available</small></span><span class="pos-item-price">${money(item.unit_price)}</span></button>`).join('');
    const cartLines = state.cart.map((line, index) => `<div class="cart-line"><span class="cart-line-name">${escapeHtml(line.name)}</span><span class="cart-line-price">${money(line.price * line.quantity)}</span><span class="cart-line-sub">${line.quantity} × ${money(line.price)}</span><button class="cart-remove" data-remove-cart="${index}" aria-label="Remove ${escapeHtml(line.name)}">×</button></div>`).join('');
    const total = state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    return `${pageHeading('Point of sale.', 'Record a counter sale and update stock in one step.')}
        <div class="pos-layout"><div><div class="toolbar"><span class="inventory-summary">FINISHED PRODUCTS · ${products.length} ITEMS</span></div><div class="pos-items">${items || '<section class="panel empty-state">Add finished products to inventory to begin a sale.</section>'}</div></div>
        <section class="panel cart-panel"><div class="panel-head"><div><h2>Current sale</h2><p>${state.cart.length} ${state.cart.length === 1 ? 'line' : 'lines'}</p></div><span class="project-code">POS</span></div><div class="cart-lines">${cartLines || '<div class="cart-empty">Add a product to start this sale.</div>'}</div><form id="checkoutForm" class="cart-fields"><label>Customer<input name="customer" maxlength="100" placeholder="Walk-in customer"></label><label>Payment received<input id="paymentAmount" name="payment" inputmode="decimal" type="number" min="0" step="0.01" placeholder="0.00" required></label><div class="cart-total"><span>TOTAL DUE</span><strong>${money(total)}</strong></div><div id="cartChange" class="cart-change"></div><button class="button button-dark checkout-button" type="submit" ${state.cart.length ? '' : 'disabled'}>Complete sale <span>↗</span></button></form></section></div>`;
}

function toast(message, isError = false) {
    const element = byId('toast');
    element.textContent = message;
    element.classList.toggle('error', isError);
    element.classList.toggle('visible', true);
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => element.classList.remove('visible'), 3300);
}

function openDialog(title, description, fields, action, submitLabel) {
    byId('dialogContent').innerHTML = `<form id="recordForm" data-action="${action}"><div class="dialog-head"><div><h2>${title}</h2><p>${description}</p></div><button type="button" class="icon-button" data-close-dialog aria-label="Close dialog">×</button></div><div class="dialog-body">${fields}<div class="dialog-error" id="dialogError" role="alert"></div><div class="dialog-actions"><button type="button" class="button button-outline" data-close-dialog>Cancel</button><button class="button button-dark" type="submit">${submitLabel} <span>↗</span></button></div></div></form>`;
    byId('formDialog').showModal();
}

function inventoryDialog(item = null) {
    const value = (key) => escapeHtml(item?.[key] ?? '');
    const category = item?.category || 'Material';
    const fields = `<div class="form-grid"><input type="hidden" name="id" value="${value('id')}"><label class="form-field span-2">Item name<input name="name" maxlength="100" required value="${value('name')}" placeholder="e.g. Mild steel sheet, 2 mm"></label><label class="form-field">Type<select name="category"><option${category === 'Material' ? ' selected' : ''}>Material</option><option${category === 'Product' ? ' selected' : ''}>Product</option></select></label><label class="form-field">SKU<input name="sku" maxlength="40" required value="${value('sku')}" placeholder="MAT-SHT-002"></label><label class="form-field">Quantity on hand<input name="quantity" type="number" min="0" step="0.001" required value="${value('quantity')}" placeholder="0"></label><label class="form-field">Unit<input name="unit" maxlength="20" required value="${value('unit') || 'pcs'}" placeholder="sheets, lengths, pcs"></label><label class="form-field">Reorder level<input name="reorder_level" type="number" min="0" step="0.001" required value="${value('reorder_level')}" placeholder="0"></label><label class="form-field">Unit price (PHP)<input name="unit_price" type="number" min="0" step="0.01" required value="${value('unit_price')}" placeholder="0.00"></label></div>`;
    openDialog(item ? 'Edit stock item.' : 'Add to inventory.', 'Keep material quantities and prices current.', fields, 'save-inventory', item ? 'Save changes' : 'Add item');
}

function projectDialog() {
    const fields = `<div class="form-grid"><label class="form-field span-2">Project title<input name="title" maxlength="120" required placeholder="e.g. Sliding driveway gate"></label><label class="form-field">Customer name<input name="customer" maxlength="100" required placeholder="Customer or business"></label><label class="form-field">Contact number<input name="phone" maxlength="40" placeholder="For order status lookup"></label><label class="form-field">Estimated due date<input name="due_date" type="date"></label><label class="form-field span-2">Project notes<textarea name="details" maxlength="800" placeholder="Materials, measurements, finish or other notes"></textarea></label></div>`;
    openDialog('Start a new job.', 'Give the shop floor the details it needs.', fields, 'create-project', 'Create project');
}

function materialUsageDialog(item) {
    const fields = `<div class="form-grid"><input type="hidden" name="id" value="${Number(item.id)}"><div class="form-field span-2">Material<strong>${escapeHtml(item.name)} · ${Number(item.quantity)} ${escapeHtml(item.unit)} available</strong></div><label class="form-field">Quantity used (${escapeHtml(item.unit)})<input name="quantity" type="number" min="0.001" max="${Number(item.quantity)}" step="0.001" required placeholder="0.00"></label><label class="form-field">Project reference<input name="project_ref" maxlength="60" placeholder="Optional job code"></label></div>`;
    openDialog('Record material use.', 'Stock will be reduced and the issue added to weekly usage totals.', fields, 'record-usage', 'Record use');
}

async function refresh() {
    await loadState();
}

byId('authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    byId('authError').textContent = '';
    const submit = byId('authSubmit');
    submit.disabled = true;
    try {
        const result = await api(form.dataset.mode, values, 'POST');
        state.user = result.user;
        state.csrf = result.csrf;
        await refresh();
    } catch (error) {
        byId('authError').textContent = error.message;
    } finally {
        submit.disabled = false;
    }
});

byId('customerHome').addEventListener('click', (event) => event.preventDefault());
byId('brandHome').addEventListener('click', (event) => { event.preventDefault(); state.page = 'overview'; renderPage(); });
byId('openCustomerView').addEventListener('click', openCustomerView);
byId('customerAccountButton').addEventListener('click', () => openCustomerAccountDialog());
byId('cartButton').addEventListener('click', openCartDialog);
byId('catalogCategories').addEventListener('click', (event) => {
    const tab = event.target.closest('[data-catalog-category]');
    if (!tab) return;
    state.catalogCategory = tab.dataset.catalogCategory;
    renderCatalog();
});
byId('shopSearch').addEventListener('input', (event) => {
    state.catalogQuery = event.target.value;
    renderCatalog();
    byId('shopSearch').focus();
});
byId('catalogSort').addEventListener('change', (event) => {
    state.catalogSort = event.target.value;
    renderCatalog();
});
byId('shopSearchForm').addEventListener('submit', (event) => {
    event.preventDefault();
    renderCatalog();
});
byId('catalogGrid').addEventListener('click', (event) => {
    const button = event.target.closest('[data-order-item]');
    if (button) openOrderDialog(Number(button.dataset.orderItem));
    const addButton = event.target.closest('[data-add-shop-cart]');
    if (addButton) addToShopCart(Number(addButton.dataset.addShopCart));
});
byId('cartDialog').addEventListener('click', (event) => {
    if (event.target === byId('cartDialog') || event.target.closest('[data-close-cart]')) byId('cartDialog').close();
    const quantityButton = event.target.closest('[data-cart-quantity]');
    if (quantityButton) updateCartQuantity(Number(quantityButton.dataset.itemId), Number(quantityButton.dataset.cartQuantity));
    const removeButton = event.target.closest('[data-remove-cart-line]');
    if (removeButton) {
        state.cart = state.cart.filter((line) => Number(line.id) !== Number(removeButton.dataset.removeCartLine));
        saveCart();
        renderCartDialog();
        renderCatalog();
    }
    if (event.target.closest('[data-cart-checkout]')) checkoutCart();
});
byId('cartDialog').addEventListener('submit', async (event) => {
    if (event.target.getAttribute('id') !== 'cartCheckoutForm') return;
    event.preventDefault();
    await submitCartOrder(event.target);
});
byId('orderDialog').addEventListener('click', (event) => {
    if (event.target === byId('orderDialog') || event.target.closest('[data-close-order]')) byId('orderDialog').close();
});
byId('orderDialog').addEventListener('submit', async (event) => {
    if (event.target.getAttribute('id') !== 'customerOrderForm') return;
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    values.item_id = values.item_id ? Number(values.item_id) : null;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    byId('orderError').textContent = '';
    try {
        const result = await api('customer_order', values, 'POST');
        byId('orderDialogContent').innerHTML = `<div class="order-success"><span class="order-success-mark">✓</span><p class="eyebrow">REQUEST RECEIVED</p><h2>Thanks, ${escapeHtml(state.customerAccount.name)}.</h2><p>Your request is with the workshop. We’ll contact you at <strong>${escapeHtml(state.customerAccount.phone)}</strong> to discuss the quote and timing.</p><div class="request-code"><span>REQUEST REFERENCE</span><strong>${escapeHtml(result.request_code)}</strong></div><p class="request-note">No payment has been taken. Your order is not confirmed until the workshop agrees on the details with you.</p><button type="button" class="button button-dark" data-close-order>Done</button></div>`;
    } catch (error) {
        byId('orderError').textContent = error.message;
        button.disabled = false;
    }
});

byId('customerAccountDialog').addEventListener('click', (event) => {
    if (event.target === byId('customerAccountDialog') || event.target.closest('[data-close-customer-account]')) byId('customerAccountDialog').close();
    if (event.target.closest('[data-customer-mode]')) openCustomerAccountDialog(event.target.closest('[data-customer-mode]').dataset.customerMode);
    if (event.target.closest('[data-customer-logout]')) logoutCustomer();
});
byId('customerAccountDialog').addEventListener('submit', async (event) => {
    if (event.target.getAttribute('id') !== 'customerAccountForm') return;
    event.preventDefault();
    const form = event.target;
    const mode = form.dataset.mode;
    const values = Object.fromEntries(new FormData(form));
    const button = form.querySelector('button[type="submit"]');
    const errorBox = byId('customerAccountError');
    button.disabled = true;
    errorBox.textContent = '';
    try {
        const result = await api(mode === 'register' ? 'customer_register' : 'customer_login', values, 'POST');
        const previousCartKey = cartStorageKey();
        state.customerAccount = result.customer_account;
        state.csrf = result.csrf;
        if (state.cart.length) {
            saveCart();
            if (previousCartKey !== cartStorageKey()) localStorage.removeItem(previousCartKey);
        }
        updateCustomerAccountButton();
        byId('customerAccountDialog').close();
        toast(mode === 'register' ? 'Customer account created.' : 'Signed in to your customer account.');
        const requestedItem = state.pendingOrderItem;
        const requestedCheckout = state.pendingCheckout;
        state.pendingOrderItem = '';
        state.pendingCheckout = false;
        if (requestedCheckout) openCartDialog();
        else if (requestedItem !== '') openOrderDialog(requestedItem);
        else openCustomerAccountDialog();
    } catch (error) {
        errorBox.textContent = error.message;
    } finally { button.disabled = false; }
});

async function openCustomerView() {
    history.replaceState({}, '', `${location.pathname}?view=customer`);
    byId('appShell').hidden = true;
    byId('authGate').hidden = true;
    byId('customerScreen').hidden = false;
    try {
        state.catalog = await api('catalog');
        state.csrf = state.catalog.csrf;
        updateCustomerAccountButton();
        renderCatalog();
    } catch (error) {
        toast(error.message, true);
    }
}

function renderCatalog() {
    const items = (state.catalog.items || []).filter((item) => Number(item.quantity) > 0);
    const categories = ['All products', ...new Set(items.map((item) => productCategory(item.name)))];
    if (!categories.includes(state.catalogCategory)) state.catalogCategory = 'All products';
    byId('catalogCategories').innerHTML = categories.map((category) => `<button type="button" class="category-tab ${state.catalogCategory === category ? 'active' : ''}" data-catalog-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
    const query = state.catalogQuery.trim().toLowerCase();
    let filtered = items.filter((item) => {
        const matchesCategory = state.catalogCategory === 'All products' || productCategory(item.name) === state.catalogCategory;
        const matchesQuery = !query || `${item.name} ${item.sku}`.toLowerCase().includes(query);
        return matchesCategory && matchesQuery;
    });
    if (state.catalogSort === 'price-asc') filtered = [...filtered].sort((a, b) => Number(a.unit_price) - Number(b.unit_price));
    if (state.catalogSort === 'price-desc') filtered = [...filtered].sort((a, b) => Number(b.unit_price) - Number(a.unit_price));
    if (state.catalogSort === 'name') filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    const availableCount = items.length;
    byId('catalogCount').textContent = `${filtered.length} ${filtered.length === 1 ? 'product' : 'products'}`;
    byId('catalogSummary').textContent = query ? `Results for “${state.catalogQuery.trim()}”` : `${availableCount} products currently in stock`;
    byId('catalogEmpty').hidden = filtered.length > 0;
    byId('catalogGrid').innerHTML = filtered.map((item) => {
        const cartLine = state.cart.find((line) => Number(line.id) === Number(item.id));
        const alreadyAdded = Number(cartLine?.quantity || 0);
        return `<article class="catalog-card"><div class="catalog-card-top"><span class="catalog-sku">${escapeHtml(item.sku)}</span><span class="stock-flag in-stock">IN STOCK</span></div><div class="product-glyph" aria-hidden="true">${escapeHtml(productGlyph(item.name))}</div><h3>${escapeHtml(item.name)}</h3><div class="catalog-card-bottom"><span>${Number(item.quantity)} ${escapeHtml(item.unit)} available</span></div><div class="catalog-card-buy"><strong class="catalog-price">${money(item.unit_price)} <small>/ ${escapeHtml(item.unit)}</small></strong><button class="add-cart-button" data-add-shop-cart="${Number(item.id)}" ${alreadyAdded >= Number(item.quantity) ? 'disabled' : ''} aria-label="Add ${escapeHtml(item.name)} to cart">${alreadyAdded ? `Added ${alreadyAdded}` : 'Add to cart'} <span>＋</span></button></div></article>`;
    }).join('');
    byId('shopSearch').value = state.catalogQuery;
    byId('catalogSort').value = state.catalogSort;
    updateCartCount();
    const projects = state.catalog.projects || [];
    byId('galleryGrid').innerHTML = projects.length ? projects.map((project) => `<article class="gallery-card"><h3>${escapeHtml(project.title)}</h3><p>Completed fabrication · ${escapeHtml(shortDate((project.updated_at || '').slice(0, 10)))}</p></article>`).join('') : '<div class="empty-state">Our latest completed projects will appear here.</div>';
}

function productCategory(name) {
    const title = String(name).toLowerCase();
    if (title.includes('gate')) return 'Gates';
    if (title.includes('grille')) return 'Grilles';
    if (title.includes('handrail') || title.includes('rail')) return 'Handrails';
    return 'Custom metalwork';
}

function productGlyph(name) {
    const category = productCategory(name);
    return category === 'Gates' ? '▥' : category === 'Grilles' ? '▦' : category === 'Handrails' ? '╱' : '⌑';
}

function cartStorageKey() {
    return `rp-metal-cart-${state.customerAccount?.id || 'guest'}`;
}

function loadCart() {
    try {
        const cart = JSON.parse(localStorage.getItem(cartStorageKey()) || '[]');
        state.cart = Array.isArray(cart) ? cart.filter((line) => Number.isInteger(Number(line.id)) && Number(line.quantity) > 0) : [];
    } catch {
        state.cart = [];
    }
    updateCartCount();
}

function saveCart() {
    localStorage.setItem(cartStorageKey(), JSON.stringify(state.cart));
    updateCartCount();
}

function updateCartCount() {
    const count = state.cart.reduce((total, line) => total + Number(line.quantity || 0), 0);
    const badge = byId('cartCount');
    if (badge) {
        badge.textContent = count > 99 ? '99+' : String(count);
        badge.hidden = count === 0;
    }
}

function getCatalogItem(id) {
    return state.catalog.items.find((item) => Number(item.id) === Number(id));
}

function addToShopCart(id) {
    const item = getCatalogItem(id);
    if (!item || Number(item.quantity) <= 0) {
        toast('This product is currently unavailable.', true);
        return;
    }
    const line = state.cart.find((entry) => Number(entry.id) === id);
    if (Number(line?.quantity || 0) >= Number(item.quantity)) {
        toast(`Only ${item.quantity} ${item.unit} currently available.`, true);
        return;
    }
    if (line) line.quantity += 1;
    else state.cart.push({ id, quantity: 1 });
    saveCart();
    renderCatalog();
    toast(`${item.name} added to cart.`);
}

function updateCartQuantity(id, change) {
    const line = state.cart.find((entry) => Number(entry.id) === id);
    const item = getCatalogItem(id);
    if (!line || !item) return;
    const nextQuantity = Number(line.quantity) + change;
    if (nextQuantity <= 0) {
        state.cart = state.cart.filter((entry) => Number(entry.id) !== id);
    } else if (nextQuantity <= Number(item.quantity)) {
        line.quantity = nextQuantity;
    } else {
        toast(`Only ${item.quantity} ${item.unit} currently available.`, true);
    }
    saveCart();
    renderCartDialog();
    renderCatalog();
}

function renderCartDialog() {
    const lines = state.cart.map((line) => {
        const item = getCatalogItem(line.id);
        if (!item) return '';
        const quantity = Number(line.quantity);
        return `<article class="shop-cart-line"><div class="cart-line-icon">${escapeHtml(productGlyph(item.name))}</div><div class="shop-cart-item-copy"><strong>${escapeHtml(item.name)}</strong><span>${money(item.unit_price)} / ${escapeHtml(item.unit)} · ${Number(item.quantity)} available</span></div><div class="cart-line-total">${money(Number(item.unit_price) * quantity)}</div><div class="quantity-control"><button type="button" data-item-id="${Number(item.id)}" data-cart-quantity="-1" aria-label="Decrease ${escapeHtml(item.name)} quantity">−</button><span>${quantity}</span><button type="button" data-item-id="${Number(item.id)}" data-cart-quantity="1" aria-label="Increase ${escapeHtml(item.name)} quantity" ${quantity >= Number(item.quantity) ? 'disabled' : ''}>＋</button></div><button type="button" class="remove-cart-line" data-remove-cart-line="${Number(item.id)}" aria-label="Remove ${escapeHtml(item.name)}">Remove</button></article>`;
    }).join('');
    const total = state.cart.reduce((sum, line) => {
        const item = getCatalogItem(line.id);
        return sum + (item ? Number(item.unit_price) * Number(line.quantity) : 0);
    }, 0);
    if (!state.cart.length) {
        byId('cartDialogContent').innerHTML = `<div class="dialog-head"><div><p class="eyebrow">YOUR CART</p><h2>Nothing in your cart yet.</h2><p>Browse the catalog and add a product to start.</p></div><button type="button" class="icon-button" data-close-cart aria-label="Close cart">×</button></div><div class="dialog-body"><div class="shop-empty-cart">Your next project starts here.</div><div class="dialog-actions"><button type="button" class="button button-dark" data-close-cart>Continue shopping</button></div></div>`;
        return;
    }
    const checkout = state.customerAccount
        ? `<form id="cartCheckoutForm" class="cart-checkout-form"><label class="form-field">Fulfillment<select name="fulfillment"><option value="Pickup">Workshop pickup</option><option value="Delivery">Delivery quote</option></select></label><label class="form-field">Delivery address or notes<textarea name="details" maxlength="800" placeholder="Add delivery location, measurements, finish, or other details"></textarea></label><div class="cart-estimate"><span>ESTIMATED CATALOG TOTAL</span><strong>${money(total)}</strong></div><p class="request-note">This sends a quote/order request to the workshop. No payment is taken and inventory is not reserved until staff confirms.</p><p id="cartCheckoutError" class="form-error" role="alert"></p><button class="button button-dark cart-checkout-button" type="submit">Place order request <span>↗</span></button></form>`
        : `<div class="cart-checkout-form"><div class="cart-estimate"><span>ESTIMATED CATALOG TOTAL</span><strong>${money(total)}</strong></div><p class="request-note">Sign in to your customer account to send this cart as an order request. No payment is taken online.</p><button type="button" class="button button-dark cart-checkout-button" data-cart-checkout>Sign in to checkout <span>↗</span></button></div>`;
    byId('cartDialogContent').innerHTML = `<div class="dialog-head"><div><p class="eyebrow">YOUR CART · ${state.cart.reduce((count, line) => count + Number(line.quantity), 0)} ITEMS</p><h2>Review your order.</h2><p>Prices are estimates until the workshop confirms your quote.</p></div><button type="button" class="icon-button" data-close-cart aria-label="Close cart">×</button></div><div class="cart-dialog-body"><div class="shop-cart-lines">${lines}</div><aside class="cart-checkout">${checkout}</aside></div>`;
}

function openCartDialog() {
    renderCartDialog();
    if (!byId('cartDialog').open) byId('cartDialog').showModal();
}

function checkoutCart() {
    if (!state.cart.length) return;
    if (!state.customerAccount) {
        state.pendingCheckout = true;
        byId('cartDialog').close();
        openCustomerAccountDialog('register');
        return;
    }
    renderCartDialog();
}

async function submitCartOrder(form) {
    const values = Object.fromEntries(new FormData(form));
    if (values.fulfillment === 'Delivery' && !values.details.trim()) {
        byId('cartCheckoutError').textContent = 'Add a delivery address so the workshop can review delivery options.';
        return;
    }
    const fulfillment = values.fulfillment;
    const notes = values.details.trim();
    values.details = `Fulfillment: ${fulfillment}${notes ? `\n${notes}` : ''}`;
    values.items = state.cart.map(({ id, quantity }) => ({ id: Number(id), quantity: Number(quantity) }));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    byId('cartCheckoutError').textContent = '';
    try {
        const result = await api('customer_order', values, 'POST');
        state.cart = [];
        saveCart();
        byId('cartDialogContent').innerHTML = `<div class="order-success"><span class="order-success-mark">✓</span><p class="eyebrow">ORDER REQUEST RECEIVED</p><h2>Your request is with the workshop.</h2><p>We’ll contact you at <strong>${escapeHtml(state.customerAccount.phone)}</strong> to confirm the products, final quote, and fulfillment details.</p><div class="request-code"><span>REQUEST REFERENCE</span><strong>${escapeHtml(result.request_code)}</strong></div><div class="cart-success-total"><span>CATALOG ESTIMATE</span><strong>${money(result.quote_total)}</strong></div><p class="request-note">This is not a confirmed order. No payment was taken and stock is not reserved until the workshop approves it.</p><button type="button" class="button button-dark" data-close-cart>Continue shopping</button></div>`;
        renderCatalog();
    } catch (error) {
        byId('cartCheckoutError').textContent = error.message;
        button.disabled = false;
    }
}

function updateCustomerAccountButton() {
    const button = byId('customerAccountButton');
    if (!button) return;
    button.innerHTML = state.customerAccount ? `${escapeHtml(state.customerAccount.name)} <span>↗</span>` : 'Customer sign in <span>↗</span>';
}

async function openCustomerAccountDialog(mode = 'login') {
    if (byId('customerAccountDialog').open) byId('customerAccountDialog').close();
    if (state.customerAccount) {
        let orders = [];
        try {
            const result = await api('customer_orders');
            orders = result.orders || [];
        } catch (error) {
            toast(error.message, true);
        }
        const orderList = orders.length ? orders.map((order) => {
            const status = order.request_status === 'pending' ? 'Awaiting workshop review' : order.request_status === 'declined' ? 'Request declined' : order.status;
            return `<article class="customer-order-row"><div><strong>${escapeHtml(order.title)}</strong><span>${escapeHtml(order.project_code)} · ${escapeHtml(shortDate(order.created_at.slice(0, 10)))}</span></div><span class="status-pill ${order.request_status === 'pending' ? 'status-requested' : statusClass(order.status)}">${escapeHtml(status)}</span><p>${escapeHtml(order.details)}</p></article>`;
        }).join('') : '<div class="empty-state">No quote requests yet. Browse the catalog and send your first request.</div>';
        byId('customerAccountContent').innerHTML = `<div class="dialog-head"><div><p class="eyebrow">CUSTOMER ACCOUNT</p><h2>Hello, ${escapeHtml(state.customerAccount.name)}.</h2><p>${escapeHtml(state.customerAccount.email)} · ${escapeHtml(state.customerAccount.phone)}</p></div><button type="button" class="icon-button" data-close-customer-account aria-label="Close account">×</button></div><div class="dialog-body"><h3 class="account-section-title">Your quote requests</h3><div class="customer-order-list">${orderList}</div><div class="dialog-actions"><button type="button" class="button button-outline" data-customer-logout>Sign out</button><button type="button" class="button button-dark" data-close-customer-account>Done</button></div></div>`;
    } else {
        const registering = mode === 'register';
        byId('customerAccountContent').innerHTML = `<form id="customerAccountForm" data-mode="${registering ? 'register' : 'login'}"><div class="dialog-head"><div><p class="eyebrow">CUSTOMER ACCOUNT</p><h2>${registering ? 'Create your account.' : 'Welcome back.'}</h2><p>${registering ? 'Save your details and keep your quote requests together.' : 'Sign in to request a quote and check your requests.'}</p></div><button type="button" class="icon-button" data-close-customer-account aria-label="Close customer sign in">×</button></div><div class="dialog-body"><div class="form-grid">${registering ? '<label class="form-field span-2">Full name<input name="name" maxlength="100" autocomplete="name" required></label>' : ''}<label class="form-field span-2">Email address<input name="email" type="email" maxlength="160" autocomplete="email" required></label>${registering ? '<label class="form-field span-2">Phone number<input name="phone" maxlength="40" autocomplete="tel" required></label>' : ''}<label class="form-field span-2">Password<input name="password" type="password" minlength="${registering ? 8 : 1}" autocomplete="${registering ? 'new-password' : 'current-password'}" required></label></div><div class="dialog-error" id="customerAccountError" role="alert"></div><div class="dialog-actions customer-auth-actions"><button type="button" class="text-button" data-customer-mode="${registering ? 'login' : 'register'}">${registering ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><button class="button button-dark" type="submit">${registering ? 'Create account' : 'Sign in'} <span>↗</span></button></div></div></form>`;
    }
    byId('customerAccountDialog').showModal();
}

async function logoutCustomer() {
    try {
        const result = await api('customer_logout', {}, 'POST');
        state.csrf = result.csrf;
        state.customerAccount = null;
        updateCustomerAccountButton();
        byId('customerAccountDialog').close();
        toast('Signed out of customer account.');
    } catch (error) { toast(error.message, true); }
}

function openOrderDialog(itemId = '') {
    if (!state.customerAccount) {
        state.pendingOrderItem = itemId;
        openCustomerAccountDialog('register');
        return;
    }
    const products = state.catalog.items || [];
    const productOptions = products.map((item) => `<option value="${Number(item.id)}" ${Number(item.id) === Number(itemId) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
    const selected = products.find((item) => Number(item.id) === Number(itemId));
    const title = selected ? selected.name : '';
    byId('orderDialogContent').innerHTML = `<form id="customerOrderForm"><div class="dialog-head"><div><p class="eyebrow">CUSTOMER REQUEST</p><h2>Tell us what you need.</h2><p>Send your requirements and the workshop will contact you to confirm a quote.</p></div><button type="button" class="icon-button" data-close-order aria-label="Close request form">×</button></div><div class="dialog-body"><div class="form-grid"><div class="form-field span-2 customer-order-contact">Signed in as <strong>${escapeHtml(state.customerAccount.name)}</strong><span>${escapeHtml(state.customerAccount.email)} · ${escapeHtml(state.customerAccount.phone)}</span></div><label class="form-field span-2">Product or project type<input name="title" maxlength="120" value="${escapeHtml(title)}" placeholder="e.g. Custom sliding gate" required></label><label class="form-field span-2">Catalog item, if applicable<select name="item_id"><option value="">Custom or not listed</option>${productOptions}</select></label><label class="form-field span-2">Measurements and requirements<textarea name="details" maxlength="800" required placeholder="Approximate dimensions, materials, finish, quantity, and any other details"></textarea></label><label class="request-honeypot" aria-hidden="true">Leave this field empty<input name="website" tabindex="-1" autocomplete="off"></label></div><p class="request-note">This is a quote request, not a confirmed order or payment. The workshop will contact you to discuss pricing and timing.</p><div class="dialog-error" id="orderError" role="alert"></div><div class="dialog-actions"><button type="button" class="button button-outline" data-close-order>Cancel</button><button class="button button-dark" type="submit">Send request <span>↗</span></button></div></div></form>`;
    byId('orderDialog').showModal();
}

async function logout() {
    try { await api('logout', {}, 'POST'); } catch (error) { toast(error.message, true); }
    state.user = null;
    state.csrf = null;
    state.cart = [];
    showGate(true);
}

byId('logoutButton').addEventListener('click', logout);
byId('mobileLogout').addEventListener('click', logout);
byId('mobileCustomer').addEventListener('click', openCustomerView);

document.querySelectorAll('.nav-link').forEach((button) => button.addEventListener('click', () => {
    state.page = button.dataset.page;
    renderPage();
}));

byId('pageContent').addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.reviewRequest) {
        const decision = target.dataset.decision;
        if (decision === 'declined' && !window.confirm('Decline this customer request?')) return;
        target.disabled = true;
        try {
            await api('review_request', { id: Number(target.dataset.reviewRequest), decision }, 'POST');
            toast(decision === 'approved' ? 'Request approved and moved into the job queue.' : 'Request declined.');
            await refresh();
            state.page = 'projects';
            renderPage();
        } catch (error) {
            toast(error.message, true);
            target.disabled = false;
        }
    } else if (target.dataset.pageJump) {
        state.page = target.dataset.pageJump;
        renderPage();
    } else if (target.dataset.action === 'new-project') {
        projectDialog();
    } else if (target.dataset.action === 'new-inventory') {
        inventoryDialog();
    } else if (target.dataset.editItem) {
        inventoryDialog(state.inventory.find((item) => Number(item.id) === Number(target.dataset.editItem)));
    } else if (target.dataset.useItem) {
        const item = state.inventory.find((entry) => Number(entry.id) === Number(target.dataset.useItem));
        if (item) materialUsageDialog(item);
    } else if (target.dataset.deleteItem) {
        const item = state.inventory.find((entry) => Number(entry.id) === Number(target.dataset.deleteItem));
        if (item && window.confirm(`Remove ${item.name} from inventory?`)) {
            try {
                await api('delete_inventory', { id: Number(item.id) }, 'POST');
                toast('Inventory item removed.');
                await refresh();
            } catch (error) { toast(error.message, true); }
        }
    } else if (target.dataset.addCart) {
        const item = state.inventory.find((entry) => Number(entry.id) === Number(target.dataset.addCart));
        if (item) {
            const line = state.cart.find((entry) => entry.id === Number(item.id));
            const inCart = line ? line.quantity : 0;
            if (inCart >= Number(item.quantity)) {
                toast('The cart already contains all available stock.', true);
                return;
            }
            if (line) line.quantity += 1;
            else state.cart.push({ id: Number(item.id), name: item.name, price: Number(item.unit_price), quantity: 1 });
            renderPage();
        }
    } else if (target.dataset.removeCart !== undefined) {
        state.cart.splice(Number(target.dataset.removeCart), 1);
        renderPage();
    }
});

byId('pageContent').addEventListener('input', (event) => {
    if (event.target.id === 'inventorySearch' || event.target.id === 'inventoryFilter') filterInventory();
    if (event.target.id === 'paymentAmount') {
        const total = state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
        const payment = Number(event.target.value);
        byId('cartChange').textContent = payment >= total && total ? `Change due ${money(payment - total)}` : '';
    }
});

byId('pageContent').addEventListener('change', async (event) => {
    if (event.target.id === 'inventoryFilter') filterInventory();
    const statusId = event.target.dataset.projectStatus;
    const showcaseId = event.target.dataset.projectShowcase;
    if (statusId || showcaseId) {
        const id = Number(statusId || showcaseId);
        const project = state.projects.find((entry) => Number(entry.id) === id);
        if (!project) return;
        const status = statusId ? event.target.value : project.status;
        const showcase = showcaseId ? event.target.checked : Boolean(Number(project.showcase));
        try {
            await api('update_project', { id, status, showcase }, 'POST');
            toast('Project progress updated.');
            await refresh();
        } catch (error) { toast(error.message, true); }
    }
});

function filterInventory() {
    const query = (byId('inventorySearch')?.value || '').toLowerCase();
    const filter = byId('inventoryFilter')?.value || 'all';
    document.querySelectorAll('[data-inventory-row]').forEach((row) => {
        const item = state.inventory.find((entry) => `${entry.name} ${entry.sku}`.toLowerCase() === row.dataset.search);
        const matchesText = row.dataset.search.includes(query);
        const matchesFilter = filter === 'all' || row.dataset.category === filter || (filter === 'low' && item && Number(item.quantity) <= Number(item.reorder_level));
        row.hidden = !(matchesText && matchesFilter);
    });
}

byId('formDialog').addEventListener('click', (event) => {
    if (event.target === byId('formDialog') || event.target.closest('[data-close-dialog]')) byId('formDialog').close();
});

byId('formDialog').addEventListener('submit', async (event) => {
    if (event.target.getAttribute('id') !== 'recordForm') return;
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    const action = form.dataset.action;
    if (action === 'save-inventory') {
        for (const field of ['id', 'quantity', 'reorder_level', 'unit_price']) values[field] = values[field] ? Number(values[field]) : (field === 'id' ? null : 0);
    } else if (action === 'record-usage') {
        values.id = Number(values.id);
        values.quantity = Number(values.quantity);
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    byId('dialogError').textContent = '';
    try {
        const result = await api(action.replaceAll('-', '_'), values, 'POST');
        byId('formDialog').close();
        toast(action === 'create-project' ? `Project created · ${result.project_code}` : action === 'save-inventory' ? 'Inventory saved.' : action === 'record-usage' ? 'Material use recorded.' : 'Project created.');
        await refresh();
    } catch (error) {
        byId('dialogError').textContent = error.message;
    } finally { button.disabled = false; }
});

byId('pageContent').addEventListener('submit', async (event) => {
    if (event.target.id !== 'checkoutForm') return;
    event.preventDefault();
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    values.payment = Number(values.payment);
    values.items = state.cart.map(({ id, quantity }) => ({ id, quantity }));
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const result = await api('create_sale', values, 'POST');
        state.cart = [];
        toast(`Sale recorded · ${result.receipt_no} · Change ${money(result.change_due)}`);
        await refresh();
        state.page = 'pos';
        renderPage();
    } catch (error) {
        toast(error.message, true);
        button.disabled = false;
    }
});

byId('chatLauncher').addEventListener('click', () => {
    byId('chatPanel').hidden = !byId('chatPanel').hidden;
    if (!byId('chatPanel').hidden) byId('chatForm').elements.message.focus();
});
byId('closeChat').addEventListener('click', () => { byId('chatPanel').hidden = true; });
byId('chatForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.elements.message.value.trim();
    if (!message) return;
    addChatMessage(message, 'visitor-message');
    form.reset();
    try {
        const result = await api('chat', { message }, 'POST');
        addChatMessage(result.answer, 'assistant-message');
    } catch (error) {
        addChatMessage(error.message, 'assistant-message');
    }
});

function addChatMessage(text, className) {
    const message = document.createElement('div');
    message.className = `chat-message ${className}`;
    message.textContent = text;
    byId('chatMessages').append(message);
    byId('chatMessages').scrollTop = byId('chatMessages').scrollHeight;
}

loadState();