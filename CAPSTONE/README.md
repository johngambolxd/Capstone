# Forgeflow Metal Fabrication Management System

A local web-based shop system for RP Metal Fabrication. Built with PHP 8.2, SQLite, and browser-native JavaScript; no separate database server or package installation is required.

## Start the system

1. Open the XAMPP Control Panel and start Apache.
2. Visit [http://localhost/CAPSTONE/](http://localhost/CAPSTONE/) in a browser.
3. On first launch, create the workshop administrator account. The password must be at least 10 characters.
4. Customers open [http://localhost/CAPSTONE/?view=customer](http://localhost/CAPSTONE/?view=customer) to view products and completed showcase projects.
5. From the customer catalog, select **Customer sign in** to create a customer account or sign in with email and password. Customer accounts are separate from the staff administrator login.

The application creates `data/mfms.sqlite` and sample workshop records on first launch. Apache needs write access to the `data` directory. The SQLite file is excluded from version control and blocked from direct access through Apache.

For local development, the XAMPP PHP server can also run the app with:

```powershell
C:\xampp\php\php.exe -S 127.0.0.1:8000 -t C:\xampp\htdocs\CAPSTONE
```

Then visit [http://127.0.0.1:8000/](http://127.0.0.1:8000/). The PHP development server is intended for local use only.

## Included workflows

- Point of sale with customer name, automatic totals and change, receipts, and stock deduction in a single database transaction.
- Raw-material and finished-product inventory with SKU, on-hand balance, reorder point, low-stock indicators, and job-linked material-use records.
- Project records with customer/contact details, due dates, progress stages, and completed-project showcase controls.
- Customer storefront with product search, categories, price sorting, stock-aware shopping cart, and custom-quote requests for made-to-order items. Separate customer registration/sign-in keeps a private quote/order request history; cart checkout creates one staff-review request and does not take online payment or reserve stock.
- Catalog-aware assistant for product prices, live stock, item/SKU lookup, comparisons, shop hours, services, estimate guidance, and project lookups. For product specifications not stored in the catalog, it asks the customer to submit a quote request instead of inventing details. It is rules-based, not an AI design consultant.
- Dashboard summaries for sales, active jobs, stock alerts, inventory value, recent sales trends, and weekly material usage.

Sample customer-view photographs are stored locally in `assets/`. Credits and license links are shown beneath each image; they are reference examples, not photos of RP Metal Fabrication's own jobs.

## Data and scope

Workshop records stay in `data/mfms.sqlite` on this computer. Back up that file after stopping Apache or the local PHP server. The included inventory and projects are starter examples and can be edited in the system. Customer requests are not confirmed orders; staff must review requirements and contact the customer to agree on a quote and schedule. Online payment processing, payroll, fabrication drawings, and engineering advice are not included.