<?php
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

try {
    $pdo = db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {
        $action = $_GET['action'] ?? 'state';
        if ($action === 'customer_orders') {
            requireCustomer();
            $statement = $pdo->prepare('SELECT project_code, title, details, status, request_status, due_date, created_at FROM projects WHERE customer_id = ? ORDER BY id DESC');
            $statement->execute([(int)$_SESSION['customer_id']]);
            jsonResponse(['orders' => $statement->fetchAll()]);
        }
        if ($action === 'catalog') {
            if (empty($_SESSION['csrf'])) {
                $_SESSION['csrf'] = bin2hex(random_bytes(32));
            }
            $items = $pdo->query("SELECT id, name, sku, quantity, unit, unit_price FROM inventory WHERE category = 'Product' ORDER BY name")->fetchAll();
            $projects = $pdo->query("SELECT project_code, title, customer, details, status, updated_at FROM projects WHERE showcase = 1 AND status = 'Completed' ORDER BY updated_at DESC")->fetchAll();
            jsonResponse(['items' => $items, 'projects' => $projects, 'csrf' => $_SESSION['csrf']]);
        }
        if ($action !== 'state') {
            jsonResponse(['error' => 'Unknown request.'], 404);
        }

        $ownerExists = (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0;
        $user = currentUser();
        $customer = currentCustomer();
        $response = ['owner_exists' => $ownerExists, 'user' => $user, 'customer_account' => $customer, 'csrf' => $_SESSION['csrf'] ?? null];
        if ($customer) {
            jsonResponse($response);
        }
        if ($user) {
            $response['inventory'] = $pdo->query('SELECT * FROM inventory ORDER BY category, name')->fetchAll();
            $response['projects'] = $pdo->query('SELECT * FROM projects ORDER BY CASE request_status WHEN "pending" THEN 0 ELSE 1 END, CASE status WHEN "Queued" THEN 1 WHEN "In progress" THEN 2 WHEN "Finishing" THEN 3 ELSE 4 END, due_date')->fetchAll();
            $response['sales'] = $pdo->query('SELECT s.*, (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS item_count FROM sales s ORDER BY s.id DESC LIMIT 8')->fetchAll();
            $response['metrics'] = [
                'today_sales' => (float)$pdo->query("SELECT COALESCE(SUM(subtotal), 0) FROM sales WHERE date(created_at, 'localtime') = date('now', 'localtime')")->fetchColumn(),
                'month_sales' => (float)$pdo->query("SELECT COALESCE(SUM(subtotal), 0) FROM sales WHERE strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')")->fetchColumn(),
                'active_projects' => (int)$pdo->query("SELECT COUNT(*) FROM projects WHERE status != 'Completed' AND request_status = 'approved'")->fetchColumn(),
                'low_stock' => (int)$pdo->query('SELECT COUNT(*) FROM inventory WHERE quantity <= reorder_level')->fetchColumn(),
                'stock_value' => (float)$pdo->query('SELECT COALESCE(SUM(quantity * unit_price), 0) FROM inventory')->fetchColumn(),
                'transactions' => (int)$pdo->query("SELECT COUNT(*) FROM sales WHERE date(created_at, 'localtime') = date('now', 'localtime')")->fetchColumn(),
                'usage_events' => (int)$pdo->query("SELECT COUNT(*) FROM inventory_movements WHERE created_at >= datetime('now', '-6 days', 'start of day')")->fetchColumn(),
            ];
            $response['sales_chart'] = $pdo->query("SELECT date(created_at, 'localtime') AS day, SUM(subtotal) AS total FROM sales WHERE created_at >= datetime('now', '-6 days', 'start of day') GROUP BY day ORDER BY day")->fetchAll();
            $response['material_usage'] = $pdo->query("SELECT i.name, i.unit, SUM(m.quantity) AS quantity, COUNT(*) AS uses FROM inventory_movements m JOIN inventory i ON i.id = m.inventory_id WHERE m.created_at >= datetime('now', '-6 days', 'start of day') GROUP BY i.id ORDER BY quantity DESC LIMIT 5")->fetchAll();
        }
        jsonResponse($response);
    }

    if ($method !== 'POST') {
        jsonResponse(['error' => 'Method not allowed.'], 405);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        jsonResponse(['error' => 'Invalid request body.'], 400);
    }
    $action = cleanText($input['action'] ?? '', 40);

    if ($action === 'setup') {
        if ((int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
            jsonResponse(['error' => 'An administrator account already exists.'], 409);
        }
        $name = cleanText($input['name'] ?? '', 80);
        $username = strtolower(cleanText($input['username'] ?? '', 40));
        $password = is_string($input['password'] ?? null) ? $input['password'] : '';
        if ($name === '' || !preg_match('/^[a-z0-9._-]{3,40}$/', $username) || strlen($password) < 10) {
            jsonResponse(['error' => 'Enter your name, a username (3-40 letters, numbers, dots, underscores or hyphens), and a password of at least 10 characters.'], 422);
        }
        $statement = $pdo->prepare('INSERT INTO users (name, username, password_hash) VALUES (?, ?, ?)');
        $statement->execute([$name, $username, password_hash($password, PASSWORD_DEFAULT)]);
        session_regenerate_id(true);
        unset($_SESSION['customer_id'], $_SESSION['customer_name'], $_SESSION['customer_email'], $_SESSION['customer_phone']);
        $_SESSION['user_id'] = (int)$pdo->lastInsertId();
        $_SESSION['user_name'] = $name;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        jsonResponse(['user' => currentUser(), 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'login') {
        $username = strtolower(cleanText($input['username'] ?? '', 40));
        $password = is_string($input['password'] ?? null) ? $input['password'] : '';
        $statement = $pdo->prepare('SELECT id, name, password_hash FROM users WHERE username = ?');
        $statement->execute([$username]);
        $account = $statement->fetch();
        if (!$account || !password_verify($password, $account['password_hash'])) {
            jsonResponse(['error' => 'Username or password is incorrect.'], 401);
        }
        session_regenerate_id(true);
        unset($_SESSION['customer_id'], $_SESSION['customer_name'], $_SESSION['customer_email'], $_SESSION['customer_phone']);
        $_SESSION['user_id'] = (int)$account['id'];
        $_SESSION['user_name'] = $account['name'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        jsonResponse(['user' => currentUser(), 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'customer_register') {
        requireCsrf();
        $name = cleanText($input['name'] ?? '', 100);
        $email = strtolower(cleanText($input['email'] ?? '', 160));
        $phone = cleanText($input['phone'] ?? '', 40);
        $password = is_string($input['password'] ?? null) ? $input['password'] : '';
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $phone === '' || strlen($password) < 8) {
            jsonResponse(['error' => 'Enter your name, a valid email, phone number, and a password of at least 8 characters.'], 422);
        }
        try {
            $statement = $pdo->prepare('INSERT INTO customer_accounts (name, email, phone, password_hash) VALUES (?, ?, ?, ?)');
            $statement->execute([$name, $email, $phone, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $error) {
            if (str_contains(strtolower($error->getMessage()), 'unique')) {
                jsonResponse(['error' => 'An account with this email already exists. Sign in instead.'], 409);
            }
            throw $error;
        }
        session_regenerate_id(true);
        unset($_SESSION['user_id'], $_SESSION['user_name']);
        $_SESSION['customer_id'] = (int)$pdo->lastInsertId();
        $_SESSION['customer_name'] = $name;
        $_SESSION['customer_email'] = $email;
        $_SESSION['customer_phone'] = $phone;
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        jsonResponse(['customer_account' => currentCustomer(), 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'customer_login') {
        requireCsrf();
        $email = strtolower(cleanText($input['email'] ?? '', 160));
        $password = is_string($input['password'] ?? null) ? $input['password'] : '';
        $statement = $pdo->prepare('SELECT id, name, email, phone, password_hash FROM customer_accounts WHERE email = ? COLLATE NOCASE');
        $statement->execute([$email]);
        $account = $statement->fetch();
        if (!$account || !password_verify($password, $account['password_hash'])) {
            jsonResponse(['error' => 'Email or password is incorrect.'], 401);
        }
        session_regenerate_id(true);
        unset($_SESSION['user_id'], $_SESSION['user_name']);
        $_SESSION['customer_id'] = (int)$account['id'];
        $_SESSION['customer_name'] = $account['name'];
        $_SESSION['customer_email'] = $account['email'];
        $_SESSION['customer_phone'] = $account['phone'];
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        jsonResponse(['customer_account' => currentCustomer(), 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'customer_logout') {
        requireCsrf();
        requireCustomer();
        unset($_SESSION['customer_id'], $_SESSION['customer_name'], $_SESSION['customer_email'], $_SESSION['customer_phone']);
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
        jsonResponse(['ok' => true, 'csrf' => $_SESSION['csrf']]);
    }

    if ($action === 'chat') {
        $question = cleanText($input['message'] ?? '', 400);
        if ($question === '') {
            jsonResponse(['error' => 'Type a question first.'], 422);
        }
        $normalized = strtolower($question);
        $catalogNames = $pdo->query("SELECT name, sku FROM inventory WHERE category = 'Product'")->fetchAll();
        $questionWords = preg_split('/[^\pL\pN-]+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $productMentioned = false;
        foreach ($catalogNames as $catalogItem) {
            if (stripos($question, $catalogItem['sku']) !== false) {
                $productMentioned = true;
                break;
            }
            $nameWords = preg_split('/[^\pL\pN]+/u', strtolower($catalogItem['name']), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            foreach ($nameWords as $nameWord) {
                if (strlen($nameWord) > 1 && !in_array($nameWord, ['the', 'and', 'for', 'per', 'standard', 'custom'], true) && in_array($nameWord, $questionWords, true)) {
                    $productMentioned = true;
                    break 2;
                }
            }
        }
        $answer = 'Thanks for reaching out. We build made-to-order gates, grilles, railings and steelwork. For a custom estimate, call or message the workshop with your measurements.';
        if (preg_match('/hour|open|close|schedule|when.*shop/', $normalized)) {
            $answer = 'Our workshop is open Monday to Saturday, 8:00 AM to 5:00 PM. Hours may change on holidays; please call ahead.';
        } elseif (preg_match('/\b(?:JOB|REQ)-\d{4,}(?:-[A-F0-9]{4})?\b/i', $question) || preg_match('/\b(?:status|progress|tracking|track)\b.*\b(?:order|project|job)\b|\b(?:order|project|job)\b.*\b(?:status|progress|tracking|track)\b/i', $question)) {
                $searchTerm = '';
                if (preg_match('/\b(?:JOB|REQ)-\d{4,}(?:-[A-F0-9]{4})?\b/i', $question, $match)) {
                    $searchTerm = $match[0];
                } elseif (preg_match('/(?<!\d)\+?\d[\d\s().-]{5,}\d(?!\d)/', $question, $match)) {
                    $searchTerm = preg_replace('/\D/', '', $match[0]);
                } else {
                    $searchTerm = preg_replace('/\b(?:can|you|please|check|what|is|the|my|order|project|status|progress|update|on|of|for|job|track|tell|me|about|a|an)\b/i', ' ', $question);
                    $searchTerm = trim(preg_replace('/\s+/', ' ', $searchTerm));
                }
                $project = false;
                if ($searchTerm !== '') {
                    $term = '%' . $searchTerm . '%';
                    $statement = $pdo->prepare('SELECT project_code, title, status, due_date FROM projects WHERE phone LIKE ? OR project_code LIKE ? OR customer LIKE ? ORDER BY id DESC LIMIT 1');
                    $statement->execute([$term, $term, $term]);
                    $project = $statement->fetch();
                }
            if ($project) {
                $answer = $project['project_code'] . ' (' . $project['title'] . ') is currently ' . strtolower($project['status']) . ($project['due_date'] ? ', with an estimated completion date of ' . date('M j, Y', strtotime($project['due_date'])) : '') . '. Contact the workshop if you need more detail.';
            } else {
                $answer = 'I could not match that to an order. Please include your project code or the phone number used when placing the order, or contact the workshop directly.';
            }
        } elseif ($productMentioned || preg_match('/\b(?:products?|catalog|items?|stock|available|availability|price|cost|cheapest|cheaper|lowest|expensive|buy|order|sell|carry|make|offer|fabricat|material|size|dimension|color|colour|finish|spec|delivery|install|quote|estimate|how much)\b/i', $normalized)) {
            $products = $pdo->query("SELECT name, sku, quantity, unit, unit_price FROM inventory WHERE category = 'Product' ORDER BY name")->fetchAll();
            $questionWords = preg_split('/[^\pL\pN-]+/u', $normalized, -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $ignoredWords = ['the', 'and', 'for', 'how', 'much', 'is', 'are', 'can', 'could', 'would', 'do', 'does', 'what', 'which', 'where', 'when', 'it', 'this', 'that', 'have', 'has', 'with', 'your', 'our', 'any', 'in', 'on', 'of', 'to', 'i', 'we', 'me', 'my', 'you', 'a', 'an', 'please', 'tell', 'about', 'product', 'products', 'catalog', 'item', 'items', 'price', 'cost', 'stock', 'available', 'availability', 'sell', 'carry', 'make', 'offer', 'fabricate', 'buy', 'order', 'quote', 'estimate', 'cheap', 'cheapest', 'cheaper', 'lowest', 'expensive', 'most', 'compare', 'comparison', 'between', 'versus', 'vs', 'material', 'materials', 'size', 'sizes', 'dimension', 'dimensions', 'color', 'colour', 'finish', 'spec', 'specs', 'specification', 'specifications', 'delivery', 'install', 'installation', 'custom', 'details'];
            $matches = [];
            foreach ($products as $product) {
                $score = stripos($question, $product['sku']) !== false ? 10 : 0;
                $productWords = preg_split('/[^\pL\pN]+/u', strtolower($product['name']), -1, PREG_SPLIT_NO_EMPTY) ?: [];
                foreach (array_unique($productWords) as $word) {
                    if (strlen($word) > 1 && !in_array($word, $ignoredWords, true) && in_array($word, $questionWords, true)) {
                        $score++;
                    }
                }
                if ($score > 0) {
                    $matches[] = ['product' => $product, 'score' => $score];
                }
            }
            usort($matches, static fn(array $left, array $right): int => $right['score'] <=> $left['score']);
            $priceIntent = preg_match('/\b(price|cost|how much|charge|cheapest|cheaper|lowest|expensive)\b/i', $normalized);
            $stockIntent = preg_match('/\b(stock|available|availability|left|quantity|in stock|ready|have any)\b/i', $normalized);
            $specIntent = preg_match('/\b(material|materials|size|sizes|dimension|dimensions|color|colour|finish|spec|specs|specification|specifications|delivery|install|installation|warranty|white|black|red|blue|green|bronze|silver|gold|matte|glossy|painted|galvanized|stainless)\b/i', $normalized);
            $formatProduct = static function (array $product): string {
                $price = '₱' . number_format((float)$product['unit_price'], 2);
                $priceUnit = match ($product['unit']) {
                    'pcs' => 'piece',
                    'sheets' => 'sheet',
                    'lengths' => 'length',
                    default => $product['unit'],
                };
                $quantity = rtrim(rtrim(number_format((float)$product['quantity'], 3, '.', ','), '0'), '.');
                $availability = (float)$product['quantity'] > 0
                    ? $quantity . ' ' . $product['unit'] . ' currently in stock'
                    : 'currently out of stock';
                return $product['name'] . ' (' . $product['sku'] . '): listed price ' . $price . ' per ' . $priceUnit . '; ' . $availability . '.';
            };
            $comparisonIntent = preg_match('/\b(compare|comparison|cheaper|cheapest|between|versus|vs|lowest|most expensive)\b/i', $normalized);
            if ($matches && $comparisonIntent && count($matches) > 1) {
                $answer = 'Here are the matching catalog items: ' . implode(' ', array_map(static fn(array $match): string => $formatProduct($match['product']), $matches)) . ' These are listed prices, not a custom quote.';
            } elseif ($matches) {
                $product = $matches[0]['product'];
                if ($priceIntent) {
                    $answer = $formatProduct($product) . ' This is the listed catalog price; custom specifications may change the final quote.';
                } elseif ($stockIntent) {
                    $answer = $product['name'] . ': ' . ((float)$product['quantity'] > 0 ? rtrim(rtrim(number_format((float)$product['quantity'], 3, '.', ','), '0'), '.') . ' ' . $product['unit'] . ' currently in stock. ' : 'currently out of stock. ') . 'Availability can change; submitting a request does not reserve stock.';
                } elseif ($specIntent) {
                    $answer = $formatProduct($product) . ' The catalog does not list detailed dimensions, material grade, color/finish options, delivery, or installation for this item. Send a quote request with your requirements and the workshop can confirm those details.';
                } else {
                    $answer = $formatProduct($product) . ' Prices are starting/listed prices. For dimensions, finish, custom options, or a final quote, send a request to the workshop.';
                }
            } elseif (preg_match('/\b(cheapest|lowest|most expensive)\b/i', $normalized)) {
                $availableProducts = array_values(array_filter($products, static fn(array $product): bool => (float)$product['quantity'] > 0));
                if ($availableProducts) {
                    usort($availableProducts, static fn(array $left, array $right): int => (float)$left['unit_price'] <=> (float)$right['unit_price']);
                    $product = preg_match('/most expensive/i', $normalized) ? $availableProducts[count($availableProducts) - 1] : $availableProducts[0];
                    $answer = 'Among currently in-stock catalog products, ' . $formatProduct($product);
                } else {
                    $answer = 'There are no finished products currently in stock. Contact the workshop for made-to-order options.';
                }
            } elseif ($products) {
                $answer = 'Current catalog: ' . implode(' ', array_map($formatProduct, $products)) . ' These listed prices are estimates; custom details and final pricing need confirmation by the workshop.';
            } else {
                $answer = 'There are no finished products listed in the catalog right now. The workshop can discuss made-to-order fabrication; send a quote request with the item and your requirements.';
            }
        } elseif (preg_match('/service|offer|make|fabricat|product|catalog/', $normalized)) {
            $answer = 'We handle made-to-order metal fabrication. Ask me about a catalog item by name or SKU for its current listed price and stock. For custom work, send a quote request with your measurements and finish requirements.';
        } elseif (preg_match('/price|cost|quote|estimate/', $normalized)) {
            $answer = 'Catalog prices are starting estimates. Custom fabrication depends on dimensions, materials and finish. Send your measurements to the workshop for a quote.';
        }
        $statement = $pdo->prepare('INSERT INTO inquiries (question, answer) VALUES (?, ?)');
        $statement->execute([$question, $answer]);
        jsonResponse(['answer' => $answer]);
    }

    if ($action === 'customer_order') {
        requireCsrf();
        requireCustomer();
        if (cleanText($input['website'] ?? '', 120) !== '') {
            jsonResponse(['ok' => true, 'request_code' => '']);
        }
        $customer = (string)$_SESSION['customer_name'];
        $phone = (string)$_SESSION['customer_phone'];
        $cart = $input['items'] ?? null;
        $title = cleanText($input['title'] ?? '', 120);
        $details = cleanText($input['details'] ?? '', 800);
        $quoteTotal = 0.0;
        if (is_array($cart)) {
            if (count($cart) === 0 || count($cart) > 30) {
                jsonResponse(['error' => 'Your cart is empty or has too many different products.'], 422);
            }
            $combinedCart = [];
            foreach ($cart as $cartLine) {
                $itemId = filter_var($cartLine['id'] ?? null, FILTER_VALIDATE_INT);
                $quantity = filter_var($cartLine['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
                if (!$itemId || $quantity === false || !is_finite((float)$quantity) || $quantity <= 0 || $quantity > 1000) {
                    jsonResponse(['error' => 'A cart item has an invalid quantity. Please review your cart.'], 422);
                }
                $combinedCart[$itemId] = ($combinedCart[$itemId] ?? 0) + (float)$quantity;
            }
            $lines = [];
            $lookup = $pdo->prepare("SELECT name, sku, quantity, unit, unit_price FROM inventory WHERE id = ? AND category = 'Product'");
            foreach ($combinedCart as $itemId => $quantity) {
                $lookup->execute([$itemId]);
                $item = $lookup->fetch();
                if (!$item) {
                    jsonResponse(['error' => 'A product in your cart is no longer listed. Refresh the catalog and try again.'], 422);
                }
                if ((float)$item['quantity'] < $quantity) {
                    jsonResponse(['error' => $item['name'] . ' only has ' . $item['quantity'] . ' ' . $item['unit'] . ' available now. Update your cart and try again.'], 422);
                }
                $lineTotal = round((float)$item['unit_price'] * (float)$quantity, 2);
                $quoteTotal += $lineTotal;
                $lines[] = $item['name'] . ' (' . $item['sku'] . '): ' . $quantity . ' ' . $item['unit'] . ' × ₱' . number_format((float)$item['unit_price'], 2) . ' = ₱' . number_format($lineTotal, 2);
            }
            $quoteTotal = round($quoteTotal, 2);
            $title = 'Online cart order (' . count($lines) . ' ' . (count($lines) === 1 ? 'item' : 'items') . ')';
            $details = "Requested items:\n" . implode("\n", $lines) . ($details !== '' ? "\n\nCustomer notes:\n" . $details : '');
        } else {
            $itemId = filter_var($input['item_id'] ?? null, FILTER_VALIDATE_INT);
            if ($title === '' || $details === '') {
                jsonResponse(['error' => 'Enter a project type and its requirements.'], 422);
            }
            if ($itemId) {
                $item = $pdo->prepare("SELECT name FROM inventory WHERE id = ? AND category = 'Product'");
                $item->execute([$itemId]);
                $productName = $item->fetchColumn();
                if (!$productName) {
                    jsonResponse(['error' => 'That catalog item is no longer available. Refresh the page and choose another.'], 422);
                }
                $details = 'Interested in: ' . cleanText($productName, 100) . "\n" . $details;
            }
        }
        $code = 'REQ-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
        $statement = $pdo->prepare("INSERT INTO projects (project_code, title, customer, phone, details, status, request_status, customer_id) VALUES (?, ?, ?, ?, ?, 'Queued', 'pending', ?)");
        $statement->execute([$code, $title, $customer, $phone, $details, (int)$_SESSION['customer_id']]);
        jsonResponse(['ok' => true, 'request_code' => $code, 'quote_total' => $quoteTotal]);
    }

    requireAdmin();
    requireCsrf();

    if ($action === 'logout') {
        $_SESSION = [];
        session_regenerate_id(true);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'save_inventory') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT) ?: null;
        $name = cleanText($input['name'] ?? '', 100);
        $category = in_array($input['category'] ?? '', ['Material', 'Product'], true) ? $input['category'] : '';
        $sku = strtoupper(cleanText($input['sku'] ?? '', 40));
        $unit = cleanText($input['unit'] ?? '', 20);
        $quantity = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
        $reorder = filter_var($input['reorder_level'] ?? null, FILTER_VALIDATE_FLOAT);
        $price = filter_var($input['unit_price'] ?? null, FILTER_VALIDATE_FLOAT);
        if ($name === '' || $category === '' || $sku === '' || $unit === '' || $quantity === false || $reorder === false || $price === false || $quantity < 0 || $reorder < 0 || $price < 0) {
            jsonResponse(['error' => 'Check the item details and enter valid non-negative quantities and prices.'], 422);
        }
        if ($id) {
            $statement = $pdo->prepare('UPDATE inventory SET name = ?, category = ?, sku = ?, quantity = ?, unit = ?, reorder_level = ?, unit_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            $statement->execute([$name, $category, $sku, $quantity, $unit, $reorder, $price, $id]);
        } else {
            $statement = $pdo->prepare('INSERT INTO inventory (name, category, sku, quantity, unit, reorder_level, unit_price) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $statement->execute([$name, $category, $sku, $quantity, $unit, $reorder, $price]);
        }
        jsonResponse(['ok' => true]);
    }

    if ($action === 'delete_inventory') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        if (!$id) {
            jsonResponse(['error' => 'Choose a valid item.'], 422);
        }
        $statement = $pdo->prepare('DELETE FROM inventory WHERE id = ? AND id NOT IN (SELECT inventory_id FROM sale_items) AND id NOT IN (SELECT inventory_id FROM inventory_movements)');
        $statement->execute([$id]);
        if ($statement->rowCount() === 0) {
            jsonResponse(['error' => 'This item has transaction history and cannot be removed.'], 409);
        }
        jsonResponse(['ok' => true]);
    }

    if ($action === 'record_usage') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $quantity = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
        $projectRef = cleanText($input['project_ref'] ?? '', 60);
        if (!$id || $quantity === false || !is_finite((float)$quantity) || $quantity <= 0) {
            jsonResponse(['error' => 'Enter a valid material quantity greater than zero.'], 422);
        }
        $pdo->beginTransaction();
        try {
            $update = $pdo->prepare("UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND category = 'Material' AND quantity >= ?");
            $update->execute([$quantity, $id, $quantity]);
            if ($update->rowCount() !== 1) {
                throw new DomainException('That material does not have enough stock. Check the quantity and try again.');
            }
            $movement = $pdo->prepare('INSERT INTO inventory_movements (inventory_id, quantity, project_ref) VALUES (?, ?, ?)');
            $movement->execute([$id, $quantity, $projectRef]);
            $pdo->commit();
            jsonResponse(['ok' => true]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error instanceof DomainException) {
                jsonResponse(['error' => $error->getMessage()], 422);
            }
            throw $error;
        }
    }

    if ($action === 'create_project') {
        $title = cleanText($input['title'] ?? '', 120);
        $customer = cleanText($input['customer'] ?? '', 100);
        $phone = cleanText($input['phone'] ?? '', 40);
        $details = cleanText($input['details'] ?? '', 800);
        $due = cleanText($input['due_date'] ?? '', 10);
        if ($title === '' || $customer === '' || ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due))) {
            jsonResponse(['error' => 'Enter a project title, customer, and a valid due date.'], 422);
        }
        $code = 'JOB-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
        $statement = $pdo->prepare('INSERT INTO projects (project_code, title, customer, phone, details, due_date) VALUES (?, ?, ?, ?, ?, ?)');
        $statement->execute([$code, $title, $customer, $phone, $details, $due]);
        jsonResponse(['ok' => true, 'project_code' => $code]);
    }

    if ($action === 'update_project') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $status = in_array($input['status'] ?? '', ['Queued', 'In progress', 'Finishing', 'Completed'], true) ? $input['status'] : '';
        $showcase = filter_var($input['showcase'] ?? false, FILTER_VALIDATE_BOOLEAN);
        if (!$id || $status === '') {
            jsonResponse(['error' => 'Choose a valid project status.'], 422);
        }
        $statement = $pdo->prepare('UPDATE projects SET status = ?, showcase = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $statement->execute([$status, $showcase && $status === 'Completed' ? 1 : 0, $id]);
        jsonResponse(['ok' => true]);
    }

    if ($action === 'review_request') {
        $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
        $decision = in_array($input['decision'] ?? '', ['approved', 'declined'], true) ? $input['decision'] : '';
        if (!$id || $decision === '') {
            jsonResponse(['error' => 'Choose whether to approve or decline this request.'], 422);
        }
        $statement = $pdo->prepare("UPDATE projects SET request_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND request_status = 'pending'");
        $statement->execute([$decision, $id]);
        if ($statement->rowCount() !== 1) {
            jsonResponse(['error' => 'This request has already been reviewed. Refresh the project list.'], 409);
        }
        jsonResponse(['ok' => true]);
    }

    if ($action === 'create_sale') {
        $customer = cleanText($input['customer'] ?? 'Walk-in customer', 100) ?: 'Walk-in customer';
        $payment = filter_var($input['payment'] ?? null, FILTER_VALIDATE_FLOAT);
        $cart = $input['items'] ?? null;
        if (!is_array($cart) || count($cart) === 0 || count($cart) > 30 || $payment === false || $payment < 0) {
            jsonResponse(['error' => 'Add items to the sale and enter a valid payment amount.'], 422);
        }
        $pdo->beginTransaction();
        try {
            $subtotal = 0.0;
            $lines = [];
            $lookup = $pdo->prepare('SELECT id, name, quantity, unit_price FROM inventory WHERE id = ?');
            foreach ($cart as $entry) {
                $itemId = filter_var($entry['id'] ?? null, FILTER_VALIDATE_INT);
                $quantity = filter_var($entry['quantity'] ?? null, FILTER_VALIDATE_FLOAT);
                if (!$itemId || $quantity === false || $quantity <= 0 || $quantity > 100000) {
                    throw new DomainException('Check the item quantities in the cart.');
                }
                $lookup->execute([$itemId]);
                $item = $lookup->fetch();
                if (!$item || (float)$item['quantity'] < $quantity) {
                    throw new DomainException(($item['name'] ?? 'An item') . ' does not have enough stock.');
                }
                $lineTotal = round($quantity * (float)$item['unit_price'], 2);
                $subtotal += $lineTotal;
                $lines[] = ['item' => $item, 'quantity' => $quantity, 'line_total' => $lineTotal];
            }
            $subtotal = round($subtotal, 2);
            if ($payment < $subtotal) {
                throw new DomainException('Payment is less than the sale total.');
            }
            $receipt = 'RC-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
            $sale = $pdo->prepare('INSERT INTO sales (receipt_no, customer, subtotal, payment, change_due) VALUES (?, ?, ?, ?, ?)');
            $sale->execute([$receipt, $customer, $subtotal, $payment, round($payment - $subtotal, 2)]);
            $saleId = (int)$pdo->lastInsertId();
            $insert = $pdo->prepare('INSERT INTO sale_items (sale_id, inventory_id, item_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)');
            $decrement = $pdo->prepare('UPDATE inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND quantity >= ?');
            foreach ($lines as $line) {
                $item = $line['item'];
                $insert->execute([$saleId, $item['id'], $item['name'], $line['quantity'], $item['unit_price'], $line['line_total']]);
                $decrement->execute([$line['quantity'], $item['id'], $line['quantity']]);
                if ($decrement->rowCount() !== 1) {
                    throw new DomainException($item['name'] . ' stock changed during checkout. Please try again.');
                }
            }
            $pdo->commit();
            jsonResponse(['ok' => true, 'receipt_no' => $receipt, 'subtotal' => $subtotal, 'change_due' => round($payment - $subtotal, 2)]);
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($error instanceof DomainException) {
                jsonResponse(['error' => $error->getMessage()], 422);
            }
            throw $error;
        }
    }

    jsonResponse(['error' => 'Unknown request.'], 404);
} catch (PDOException $error) {
    error_log($error->getMessage());
    jsonResponse(['error' => 'The system could not save that change. Check that the SKU is unique and all linked records are valid.'], 409);
} catch (Throwable $error) {
    error_log($error->getMessage());
    jsonResponse(['error' => 'A server error occurred. Please try again.'], 500);
}