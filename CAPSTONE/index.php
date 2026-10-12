<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f3f1eb">
    <title>Forgeflow | Metal shop management</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div id="authGate" class="auth-screen" hidden>
        <div class="auth-brand">
            <a class="brand-lockup" href="#" aria-label="Forgeflow home">
                <img class="brand-logo" src="assets/rp-metal-logo.svg" alt="RP Metal Fabrication logo">
                <span>FORGEFLOW<small>SHOP MANAGEMENT</small></span>
            </a>
            <div class="auth-copy">
                <p class="eyebrow">RP METAL FABRICATION</p>
                <h1>Good work<br>starts with<br><em>a clear view.</em></h1>
                <p>Orders, materials and sales, together in one place.</p>
            </div>
            <div class="auth-note"><span class="pulse-dot"></span> WORKSHOP SYSTEM <span>·</span> LOCAL INSTANCE</div>
        </div>
        <div class="auth-form-wrap">
            <form id="authForm" class="auth-form">
                <p class="eyebrow" id="authEyebrow">WORKSHOP ACCESS</p>
                <h2 id="authTitle">Welcome back.</h2>
                <p class="muted" id="authDescription">Sign in to open the shop floor.</p>
                <label id="nameField" hidden>Your name<input name="name" autocomplete="name" maxlength="80" placeholder="e.g. Maria Santos"></label>
                <label>Username<input name="username" required autocomplete="username" maxlength="40" placeholder="Your username"></label>
                <label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="At least 10 characters"></label>
                <p id="authError" class="form-error" role="alert"></p>
                <button class="button button-dark button-wide" id="authSubmit" type="submit">Sign in <span>↗</span></button>
            </form>
            <p class="auth-foot">Your shop data stays on this computer.</p>
        </div>
    </div>

    <div id="customerScreen" class="customer-screen" hidden>
        <header class="customer-header">
            <a class="brand-lockup" href="#" id="customerHome">
                <img class="brand-logo" src="assets/rp-metal-logo.svg" alt="RP Metal Fabrication logo"><span>RP METAL<small>FABRICATION</small></span>
            </a>
            <form id="shopSearchForm" class="shop-search"><input id="shopSearch" type="search" maxlength="100" placeholder="Search gates, grilles, handrails…" aria-label="Search products"><button type="submit" aria-label="Search products">⌕</button></form>
            <div class="customer-header-right"><button id="customerAccountButton" class="shop-account-button" title="Customer account"><span class="shop-header-icon">◉</span><span class="shop-account-label">Sign in</span></button><button id="cartButton" class="shop-cart-button" title="Open shopping cart"><span class="shop-header-icon">▣</span><span class="shop-cart-label">Cart</span><span id="cartCount" class="cart-count" hidden>0</span></button></div>
        </header>
        <main class="shop-main">
            <section class="shop-banner"><div><p class="eyebrow">RP METAL FABRICATION · ONLINE SHOP</p><h1>Made for your space.<br><em>Built in our workshop.</em></h1><p>Browse available products from our workshop.</p></div></section>
            <section class="shop-products" aria-labelledby="shopTitle"><div class="shop-section-heading"><div><p class="eyebrow">THE CATALOG</p><h2 id="shopTitle">Shop products</h2></div><span id="catalogCount" class="shop-result-count">0 products</span></div>
                <nav id="catalogCategories" class="category-tabs" aria-label="Product categories"></nav>
                <div class="shop-toolbar"><p id="catalogSummary">Browse available products</p><label>Sort by <select id="catalogSort"><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></label></div>
                <div id="catalogGrid" class="catalog-grid"></div>
                <div id="catalogEmpty" class="shop-empty" hidden>No products match your search. Try another term or category.</div>
            </section>
            <section class="gallery-section"><div class="section-heading"><div><p class="eyebrow">MADE AT RP METAL</p><h2>Completed work</h2></div><span class="section-count">SELECTED PROJECTS</span></div><div id="galleryGrid" class="gallery-grid"></div></section>
        </main>
        <footer class="customer-footer"><span>RP METAL FABRICATION</span><span>Orders are confirmed after workshop review.</span></footer>
        <dialog id="customerAccountDialog" class="form-dialog order-dialog"><div id="customerAccountContent"></div></dialog>
        <dialog id="orderDialog" class="form-dialog order-dialog"><div id="orderDialogContent"></div></dialog>
        <dialog id="cartDialog" class="form-dialog cart-dialog"><div id="cartDialogContent"></div></dialog>
    </div>

    <div id="appShell" class="app-shell" hidden>
        <aside class="sidebar">
            <a class="brand-lockup" href="#" id="brandHome"><img class="brand-logo" src="assets/rp-metal-logo.svg" alt="RP Metal Fabrication logo"><span>FORGEFLOW<small>SHOP MANAGEMENT</small></span></a>
            <div class="side-label">WORKSPACE</div>
            <nav class="main-nav" aria-label="Main navigation">
                <button class="nav-link active" data-page="overview"><span class="nav-icon">▦</span> Overview <span class="nav-arrow">↗</span></button>
                <button class="nav-link" data-page="pos"><span class="nav-icon">＋</span> Point of sale</button>
                <button class="nav-link" data-page="inventory"><span class="nav-icon">▤</span> Inventory <span class="nav-badge" id="lowStockBadge" hidden></span></button>
                <button class="nav-link" data-page="projects"><span class="nav-icon">⌑</span> Projects</button>
                <button class="nav-link" data-page="sales"><span class="nav-icon">↗</span> Sales history</button>
            </nav>
            <div class="sidebar-bottom">
                <button class="customer-link" id="openCustomerView"><span>◉</span> Customer view <b>↗</b></button>
                <div class="user-strip"><div class="user-avatar" id="userInitial">R</div><div class="user-meta"><strong id="userName">Workshop</strong><small>SHOP ADMINISTRATOR</small></div><button class="icon-button" id="logoutButton" title="Sign out" aria-label="Sign out">↗</button></div>
            </div>
        </aside>
        <div class="workspace">
            <header class="topbar"><div class="breadcrumb"><span>WORKSHOP</span><span class="crumb-slash">/</span><strong id="pageCrumb">OVERVIEW</strong></div><div class="topbar-right"><button class="mobile-shortcut" id="mobileCustomer" title="Customer view" aria-label="Customer view">◉</button><button class="mobile-shortcut" id="mobileLogout" title="Sign out" aria-label="Sign out">↗</button><span class="date-chip" id="todayDate"></span><span class="live-chip"><i></i> SYSTEM LIVE</span></div></header>
            <main id="pageContent" class="page-content"></main>
        </div>
    </div>

    <button class="chat-launcher" id="chatLauncher" aria-label="Open workshop assistant" title="Ask the workshop"><span class="chat-launch-icon">✳</span><span>Ask the workshop</span><i></i></button>
    <section id="chatPanel" class="chat-panel" aria-label="Workshop assistant" hidden>
        <header class="chat-header"><div class="chat-avatar">✳</div><div><strong>Workshop assistant</strong><small><i></i> HERE TO HELP</small></div><button id="closeChat" class="icon-button" aria-label="Close assistant">×</button></header>
        <div id="chatMessages" class="chat-messages"><div class="chat-message assistant-message">Hi there. Ask about our services, shop hours, estimates or a project status. For order updates, include your project code or contact number.</div></div>
        <form id="chatForm" class="chat-form"><input name="message" maxlength="400" autocomplete="off" placeholder="Ask us anything…" required><button type="submit" aria-label="Send message">↑</button></form>
        <p class="chat-disclaimer">For custom specifications, our team will be happy to help.</p>
    </section>

    <dialog id="formDialog" class="form-dialog"><div id="dialogContent"></div></dialog>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <script src="app.js" defer></script>
</body>
</html>