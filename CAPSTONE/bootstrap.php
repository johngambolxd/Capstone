<?php
declare(strict_types=1);

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $directory = __DIR__ . '/data';
    if (!is_dir($directory)) {
        mkdir($directory, 0770, true);
    }
    $pdo = new PDO('sqlite:' . $directory . '/mfms.sqlite', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    initializeDatabase($pdo);
    return $pdo;
}

function initializeDatabase(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS customer_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        phone TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('Material', 'Product')),
        sku TEXT NOT NULL UNIQUE,
        quantity REAL NOT NULL DEFAULT 0 CHECK(quantity >= 0),
        unit TEXT NOT NULL DEFAULT 'pcs',
        reorder_level REAL NOT NULL DEFAULT 0 CHECK(reorder_level >= 0),
        unit_price REAL NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id),
        quantity REAL NOT NULL CHECK(quantity > 0),
        project_ref TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        customer TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'Queued' CHECK(status IN ('Queued', 'In progress', 'Finishing', 'Completed')),
        due_date TEXT NOT NULL DEFAULT '',
        showcase INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $projectColumns = $pdo->query('PRAGMA table_info(projects)')->fetchAll();
    if (!in_array('request_status', array_column($projectColumns, 'name'), true)) {
        $pdo->exec("ALTER TABLE projects ADD COLUMN request_status TEXT NOT NULL DEFAULT 'approved' CHECK(request_status IN ('pending', 'approved', 'declined'))");
    }
    if (!in_array('customer_id', array_column($projectColumns, 'name'), true)) {
        $pdo->exec('ALTER TABLE projects ADD COLUMN customer_id INTEGER REFERENCES customer_accounts(id) ON DELETE SET NULL');
    }
    $pdo->exec("CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_no TEXT NOT NULL UNIQUE,
        customer TEXT NOT NULL DEFAULT 'Walk-in customer',
        subtotal REAL NOT NULL,
        payment REAL NOT NULL,
        change_due REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        inventory_id INTEGER NOT NULL REFERENCES inventory(id),
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        line_total REAL NOT NULL
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )");

    if ((int)$pdo->query('SELECT COUNT(*) FROM inventory')->fetchColumn() === 0) {
        $insert = $pdo->prepare('INSERT INTO inventory (name, category, sku, quantity, unit, reorder_level, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ([
            ['Mild steel sheet, 2 mm', 'Material', 'MAT-SHT-002', 18, 'sheets', 5, 1850],
            ['Square tube, 1 x 1 in', 'Material', 'MAT-TUB-001', 42, 'lengths', 12, 420],
            ['Round bar, 12 mm', 'Material', 'MAT-RDB-012', 26, 'lengths', 8, 310],
            ['Steel gate, standard', 'Product', 'PRD-GAT-001', 3, 'pcs', 1, 14500],
            ['Window grille, 3 x 4 ft', 'Product', 'PRD-GRL-034', 5, 'pcs', 2, 4800],
            ['Custom handrail, per ft', 'Product', 'PRD-HRL-CUS', 0, 'ft', 0, 1250],
        ] as $row) {
            $insert->execute($row);
        }
    }

    if ((int)$pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn() === 0) {
        $insert = $pdo->prepare('INSERT INTO projects (project_code, title, customer, phone, details, status, due_date, showcase) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ([
            ['JOB-1042', 'Sliding driveway gate', 'Dela Cruz Residence', '09171234567', 'Powder-coated steel gate, 12 ft opening.', 'In progress', date('Y-m-d', strtotime('+8 days')), 0],
            ['JOB-1041', 'Staircase handrail', 'Northline Builders', '09179876543', 'Interior handrail with satin finish.', 'Finishing', date('Y-m-d', strtotime('+3 days')), 0],
            ['JOB-1038', 'Window security grilles', 'Santos Home', '09175551234', 'Six custom window grilles, matte black.', 'Completed', date('Y-m-d', strtotime('-2 days')), 1],
        ] as $row) {
            $insert->execute($row);
        }
    }
}

function jsonResponse(array $payload, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function requireAdmin(): void
{
    if (empty($_SESSION['user_id']) || !empty($_SESSION['customer_id'])) {
        jsonResponse(['error' => 'Sign in to continue.'], 401);
    }
}

function requireCsrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $token)) {
        jsonResponse(['error' => 'Your session expired. Refresh the page and try again.'], 419);
    }
}

function cleanText(mixed $value, int $max = 180): string
{
    if (!is_string($value) && !is_numeric($value)) {
        return '';
    }
    return mb_substr(trim(strip_tags((string)$value)), 0, $max);
}

function currentUser(): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    return ['id' => (int)$_SESSION['user_id'], 'name' => (string)$_SESSION['user_name']];
}

function currentCustomer(): ?array
{
    if (empty($_SESSION['customer_id'])) {
        return null;
    }
    return [
        'id' => (int)$_SESSION['customer_id'],
        'name' => (string)$_SESSION['customer_name'],
        'email' => (string)$_SESSION['customer_email'],
        'phone' => (string)$_SESSION['customer_phone'],
    ];
}

function requireCustomer(): void
{
    if (empty($_SESSION['customer_id']) || !empty($_SESSION['user_id'])) {
        jsonResponse(['error' => 'Sign in with a customer account to continue.'], 401);
    }
}