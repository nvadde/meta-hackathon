-- =============================================================================
-- SIRE - Smart Ingestion & Reconciliation Engine
-- Database schema (Oracle style, matching the original Tables.sql dialect)
--
-- Covers everything the application currently uses:
--   * file_details / invoice_header / invoice_lines  (original invoice tables)
--   * supplier_master / project_master               (ERP feed tables behind
--                                                     the Suppliers / Projects
--                                                     screens)
--   * invoice_review_action                          (My Actions change log,
--                                                     approvals, rejections,
--                                                     manual uploads, payables
--                                                     team review confirmations)
--   * notification                                   (Payables Manager
--                                                     approval notifications)
--   * erp_invoice_queue                              (approved invoices waiting
--                                                     for ERP pickup; nothing
--                                                     is posted until an ERP
--                                                     integration is connected)
--   * currency_rate                                  (USD conversion rates used
--                                                     by the Invoice Workbench)
--   * code_lov                                       (lists of values: invoice
--                                                     source channels and
--                                                     processing statuses)
--
-- The supplier_master / project_master rows are a synthetic sample feed in the
-- application today. These tables are where a real ERP feed would land.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Reference data: lists of values (LOV)
-- -----------------------------------------------------------------------------
CREATE TABLE code_lov (
    lov_id              NUMBER NOT NULL,
    lov_type            VARCHAR2(30) NOT NULL,   -- e.g. INVOICE_SOURCE, PROCESSING_STATUS
    code                VARCHAR2(30) NOT NULL,   -- e.g. Gmail, Manual Upload, Approved
    display_name        VARCHAR2(100),
    sort_order          NUMBER,
    active_flag         VARCHAR2(1) DEFAULT 'Y',
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_code_lov PRIMARY KEY ( lov_id ),
    CONSTRAINT uq_code_lov UNIQUE ( lov_type, code )
);

-- Invoice source channels (Invoice Workbench "Source channel")
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (1, 'INVOICE_SOURCE', 'Gmail', 'Gmail', 1);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (2, 'INVOICE_SOURCE', 'WhatsApp', 'WhatsApp', 2);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (3, 'INVOICE_SOURCE', 'Manual Upload', 'Manual Upload', 3);

-- Processing statuses (invoice review lifecycle)
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (11, 'PROCESSING_STATUS', 'Received', 'Received', 1);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (12, 'PROCESSING_STATUS', 'Processing', 'Processing', 2);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (13, 'PROCESSING_STATUS', 'Matched', 'Matched', 3);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (14, 'PROCESSING_STATUS', 'Exception', 'Exception', 4);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (15, 'PROCESSING_STATUS', 'Ready', 'Ready', 5);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (16, 'PROCESSING_STATUS', 'Approved', 'Approved', 6);
INSERT INTO code_lov (lov_id, lov_type, code, display_name, sort_order)
VALUES (17, 'PROCESSING_STATUS', 'Rejected', 'Rejected', 7);


-- -----------------------------------------------------------------------------
-- ERP feed: suppliers (Suppliers screen)
-- One row per supplier, as received from the ERP Supplier Details feed.
-- -----------------------------------------------------------------------------
CREATE TABLE supplier_master (
    supplier_id         NUMBER NOT NULL,
    supplier_number     VARCHAR2(30),
    supplier_name       VARCHAR2(300) NOT NULL,
    status              VARCHAR2(30) NOT NULL,   -- Active / Inactive (code_lov SUPPLIER_STATUS)
    start_date          DATE,
    end_date            DATE,
    supplier_site       VARCHAR2(300),
    supplier_address    VARCHAR2(1000),
    source_system       VARCHAR2(30) DEFAULT 'ERP',
    last_feed_date      DATE,
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_supplier_master PRIMARY KEY ( supplier_id ),
    CONSTRAINT uq_supplier_master_name UNIQUE ( supplier_name ),
    CONSTRAINT ck_supplier_master_status CHECK ( status IN ( 'Active', 'Inactive' ) ),
    CONSTRAINT ck_supplier_master_dates CHECK ( end_date IS NULL OR end_date >= start_date )
);


-- -----------------------------------------------------------------------------
-- ERP feed: projects (Projects screen)
-- One row per project, as received from the ERP Project Details feed.
-- -----------------------------------------------------------------------------
CREATE TABLE project_master (
    project_id          NUMBER NOT NULL,
    project_number      VARCHAR2(30) NOT NULL,
    project_name        VARCHAR2(300) NOT NULL,
    status              VARCHAR2(30) NOT NULL,   -- Active / Inactive (code_lov PROJECT_STATUS)
    start_date          DATE,
    end_date            DATE,
    project_address     VARCHAR2(1000),
    source_system       VARCHAR2(30) DEFAULT 'ERP',
    last_feed_date      DATE,
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_project_master PRIMARY KEY ( project_id ),
    CONSTRAINT uq_project_master_number UNIQUE ( project_number ),
    CONSTRAINT uq_project_master_name UNIQUE ( project_name ),
    CONSTRAINT ck_project_master_status CHECK ( status IN ( 'Active', 'Inactive' ) ),
    CONSTRAINT ck_project_master_dates CHECK ( end_date IS NULL OR end_date >= start_date )
);


-- -----------------------------------------------------------------------------
-- Uploaded / received source files (original table, extended for Manual Upload)
-- The invoice detail screen serves the PDF from file_path for human verification.
-- -----------------------------------------------------------------------------
CREATE TABLE file_details (
    file_id               NUMBER NOT NULL,
    file_name             VARCHAR2(300),
    original_file_name    VARCHAR2(300),
    file_path             VARCHAR2(1000),
    file_size_bytes       NUMBER,
    mime_type             VARCHAR2(100),
    source_channel        VARCHAR2(30),          -- Gmail / WhatsApp / Manual Upload (code_lov INVOICE_SOURCE)
    message_id            VARCHAR2(300),
    status                VARCHAR2(1),
    creation_date         DATE,
    updated_date          DATE,
    created_by            VARCHAR2(30),
    updated_by            VARCHAR2(30),
    CONSTRAINT pk_file PRIMARY KEY ( file_id )
);

INSERT INTO file_details (file_id, file_name , original_file_name, file_path, file_size_bytes, mime_type, source_channel, message_id, status, creation_date, updated_date, created_by, updated_by )
VALUES (file_seq.nextval, 'Test.pdf', 'Test.pdf', '/file/Test.pdf', null, null, 'GMAIL', null, 'V', sysdate, sysdate, '-1', '-1');

-- -----------------------------------------------------------------------------
-- Invoice header (original table, extended for the review workbench)
-- -----------------------------------------------------------------------------
CREATE TABLE invoice_header (
    header_id                    NUMBER NOT NULL,
    file_id                      NUMBER,
    supplier_id                  NUMBER,         -- -> supplier_master.supplier_id
    project_id                   NUMBER,         -- -> project_master.project_id
    amount_due                   NUMBER,
    due_date                     DATE,
    billing_address              VARCHAR2(300),
    billing_address_recipient    VARCHAR2(300),
    customer_address             VARCHAR2(300),  -- shown as Bill To address
    customer_address_recipient   VARCHAR2(300),
    invoice_source               VARCHAR2(30),   -- code_lov INVOICE_SOURCE
    invoice_type                 VARCHAR2(30),   -- Invoice / Credit Memo / Debit Memo
    invoice_number               VARCHAR2(30),
    invoice_date                 DATE,
    received_date                DATE,
    invoice_currency             VARCHAR2(30),
    processing_status            VARCHAR2(30) DEFAULT 'Received',  -- code_lov PROCESSING_STATUS
    exception_count              NUMBER DEFAULT 0,
    payables_review_confirmed    VARCHAR2(1) DEFAULT 'N',  -- Y when payables team reviewed an inactive supplier/project invoice
    payables_review_date         DATE,
    project_number               VARCHAR2(30),
    job_number                   VARCHAR2(30),
    payment_terms                VARCHAR2(30),
    previous_unpaid_balance      NUMBER,
    remittance_address           VARCHAR2(300),
    remittance_address_recipient VARCHAR2(300),
    shipping_address             VARCHAR2(300),
    shipping_address_recipient   VARCHAR2(300),
    shipping_cost                NUMBER,
    total_tax                    NUMBER,
    total_vat                    NUMBER,
    vendor_name                  VARCHAR2(300),
    vendor_address               VARCHAR2(300),
    vendor_address_receipient    VARCHAR2(300),
    vendor_logo                  VARCHAR2(300),
    supplier_number              VARCHAR2(30),
    supplier_name                VARCHAR2(300),
    supplier_status              VARCHAR2(30),
    supplier_site_id             NUMBER,
    supplier_site_status         VARCHAR2(30),
    site_payment_flag            VARCHAR2(30),
    business_unit                VARCHAR2(300),
    ledger_id                    NUMBER,
    legal_entity_name            VARCHAR2(300),
    legal_entity_id              NUMBER,
    sender_name                  VARCHAR2(300),
    sender_email                 VARCHAR2(300),
    creation_date                DATE,
    updated_date                 DATE,
    created_by                   VARCHAR2(30),
    updated_by                   VARCHAR2(30),
    CONSTRAINT pk_header PRIMARY KEY ( header_id ),
    CONSTRAINT fk_header_file FOREIGN KEY ( file_id )
        REFERENCES file_details ( file_id ),
    CONSTRAINT ck_header_exception_count CHECK ( exception_count >= 0 ),
    CONSTRAINT ck_header_review_flag CHECK ( payables_review_confirmed IN ( 'Y', 'N' ) )
);

INSERT INTO invoice_header (
    header_id, file_id, supplier_id, project_id, amount_due, due_date,
    billing_address, billing_address_recipient, customer_address, customer_address_recipient,
    invoice_source, invoice_type, invoice_number, invoice_date, received_date,
    invoice_currency, processing_status, exception_count, payables_review_confirmed,
    project_number, job_number, payment_terms, previous_unpaid_balance,
    total_tax, vendor_name, supplier_number, supplier_name
) VALUES (
    inv_header_seq.nextval, 1, 101, 201, 5400.00, TO_DATE('2026-11-15', 'YYYY-MM-DD'),
    '123 Corporate Way, Suite 400, Austin, TX 78701', 'Accounts Payable Dept', '123 Corporate Way, Suite 400, Austin, TX 78701', 'ACME Corp',
    'PORTAL', 'Invoice', 'INV-2026-0089', TO_DATE('2026-10-15', 'YYYY-MM-DD'), TO_DATE('2026-10-16', 'YYYY-MM-DD'),
    'USD', 'Processed', 0, 'N',
    'PRJ-992', 'JOB-441', 'Net 30', 0.00,
    400.00, 'TechSupply Solutions LLC', 'SUP-8899', 'TechSupply Solutions LLC'
);

-- -----------------------------------------------------------------------------
-- Invoice lines (original table, extended with units)
-- -----------------------------------------------------------------------------
CREATE TABLE invoice_lines (
    line_id             NUMBER NOT NULL,
    header_id           NUMBER,
    line_num            VARCHAR2(30),
    name                VARCHAR2(300),
    quantity            NUMBER,
    units               VARCHAR2(30),            -- ea / hrs / m / m3 / tonnes / loads ...
    product_code        VARCHAR2(300),
    unit_price          NUMBER,
    amount              NUMBER,
    description         VARCHAR2(300),           -- Item Description
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_lines PRIMARY KEY ( line_id ),
    CONSTRAINT fk_lines_header FOREIGN KEY ( header_id )
        REFERENCES invoice_header ( header_id )
);

insert into invoice_lines (ine_id, header_id, line_num, name, quantity, units, product_code, unit_price, amount, description, creation_date, updated_date, created_by, updated_by)
values (inv_line_seq.nextval, 2, 1, 'test', 1, 10, 'abc', 10, 100, 'test', sysdate, sysdate, '-1', '-1');

-- -----------------------------------------------------------------------------
-- Review actions / change log (My Actions "My changes")
-- One row per save, approval, rejection, manual upload, automatic rejection,
-- or payables team review confirmation. change_text records old -> new values.
-- -----------------------------------------------------------------------------
CREATE TABLE invoice_review_action (
    action_id           NUMBER NOT NULL,
    header_id           NUMBER NOT NULL,
    action_type         VARCHAR2(30) NOT NULL,   -- EDIT / APPROVE / REJECT / AUTO_REJECT / MANUAL_UPLOAD / PAYABLES_REVIEW
    action_by           VARCHAR2(100),
    action_date         DATE DEFAULT SYSDATE,
    old_status          VARCHAR2(30),
    new_status          VARCHAR2(30),
    remarks             VARCHAR2(2000),          -- approval / rejection remarks (mandatory for decisions)
    change_text         VARCHAR2(4000),          -- human readable field changes, e.g. "Amount: USD 100.00 -> USD 120.00"
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_review_action PRIMARY KEY ( action_id ),
    CONSTRAINT fk_review_action_header FOREIGN KEY ( header_id )
        REFERENCES invoice_header ( header_id ),
    CONSTRAINT ck_review_action_type CHECK (
        action_type IN ( 'EDIT', 'APPROVE', 'REJECT', 'AUTO_REJECT', 'MANUAL_UPLOAD', 'PAYABLES_REVIEW' )
    )
);


-- -----------------------------------------------------------------------------
-- Notifications (approval notifications to Payables Manager)
-- In-app notifications today; recipient_email is recorded for a future
-- email integration. Creating a row does not send an email by itself.
-- -----------------------------------------------------------------------------
CREATE TABLE notification (
    notification_id     NUMBER NOT NULL,
    header_id           NUMBER,
    notification_type   VARCHAR2(30) NOT NULL,   -- INVOICE_APPROVED / INVOICE_REJECTED
    recipient_role      VARCHAR2(100),           -- e.g. Payables Manager
    recipient_email     VARCHAR2(300),           -- e.g. payablesmanager@sire.com
    subject             VARCHAR2(300),
    remarks             VARCHAR2(2000),          -- remarks/comments entered by the approver
    is_read             VARCHAR2(1) DEFAULT 'N',
    read_date           DATE,
    delivery_channel    VARCHAR2(30) DEFAULT 'IN_APP',  -- IN_APP / EMAIL (EMAIL not connected yet)
    delivery_status     VARCHAR2(30) DEFAULT 'PENDING',
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_notification PRIMARY KEY ( notification_id ),
    CONSTRAINT fk_notification_header FOREIGN KEY ( header_id )
        REFERENCES invoice_header ( header_id ),
    CONSTRAINT ck_notification_read CHECK ( is_read IN ( 'Y', 'N' ) )
);


-- -----------------------------------------------------------------------------
-- Approved invoices awaiting ERP pickup
-- Approved invoices are queued here. An ERP integration (not yet connected)
-- would pick rows up, create the ERP invoice, and store its reference back.
-- -----------------------------------------------------------------------------
CREATE TABLE erp_invoice_queue (
    queue_id            NUMBER NOT NULL,
    header_id           NUMBER NOT NULL,
    queue_status        VARCHAR2(30) DEFAULT 'QUEUED',  -- QUEUED / PROCESSING / CREATED / FAILED
    queued_date         DATE DEFAULT SYSDATE,
    processed_date      DATE,
    erp_invoice_id      VARCHAR2(100),           -- reference returned by the ERP once created
    erp_system          VARCHAR2(100),
    attempt_count       NUMBER DEFAULT 0,
    last_error          VARCHAR2(2000),
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_erp_queue PRIMARY KEY ( queue_id ),
    CONSTRAINT fk_erp_queue_header FOREIGN KEY ( header_id )
        REFERENCES invoice_header ( header_id ),
    CONSTRAINT uq_erp_queue_header UNIQUE ( header_id ),
    CONSTRAINT ck_erp_queue_status CHECK (
        queue_status IN ( 'QUEUED', 'PROCESSING', 'CREATED', 'FAILED' )
    )
);


-- -----------------------------------------------------------------------------
-- Currency conversion rates (Invoice Workbench "Amount in USD")
-- Rows with is_sample_rate = 'Y' are static display rates, not live FX.
-- -----------------------------------------------------------------------------
CREATE TABLE currency_rate (
    rate_id             NUMBER NOT NULL,
    currency_code       VARCHAR2(3) NOT NULL,    -- ISO currency, e.g. EUR
    rate_to_usd         NUMBER NOT NULL,         -- 1 unit of currency_code = rate_to_usd USD
    effective_date      DATE,
    is_sample_rate      VARCHAR2(1) DEFAULT 'N', -- Y = sample rate, not live FX
    source              VARCHAR2(100),           -- e.g. SAMPLE / ECB / ERP feed
    creation_date       DATE,
    updated_date        DATE,
    created_by          VARCHAR2(30),
    updated_by          VARCHAR2(30),
    CONSTRAINT pk_currency_rate PRIMARY KEY ( rate_id ),
    CONSTRAINT uq_currency_rate UNIQUE ( currency_code, effective_date ),
    CONSTRAINT ck_currency_rate_sample CHECK ( is_sample_rate IN ( 'Y', 'N' ) ),
    CONSTRAINT ck_currency_rate_positive CHECK ( rate_to_usd > 0 )
);

INSERT INTO currency_rate (rate_id, currency_code, rate_to_usd, effective_date, is_sample_rate, source)
VALUES (1, 'USD', 1, SYSDATE, 'Y', 'SAMPLE');
INSERT INTO currency_rate (rate_id, currency_code, rate_to_usd, effective_date, is_sample_rate, source)
VALUES (2, 'EUR', 1.08, SYSDATE, 'Y', 'SAMPLE');
INSERT INTO currency_rate (rate_id, currency_code, rate_to_usd, effective_date, is_sample_rate, source)
VALUES (3, 'GBP', 1.27, SYSDATE, 'Y', 'SAMPLE');


-- -----------------------------------------------------------------------------
-- Indexes for the screens' common lookups
-- -----------------------------------------------------------------------------
CREATE INDEX ix_header_supplier ON invoice_header ( supplier_id );
CREATE INDEX ix_header_project ON invoice_header ( project_id );
CREATE INDEX ix_header_status ON invoice_header ( processing_status );
CREATE INDEX ix_header_invoice_number ON invoice_header ( invoice_number );
CREATE INDEX ix_header_received_date ON invoice_header ( received_date );
CREATE INDEX ix_lines_header ON invoice_lines ( header_id );
CREATE INDEX ix_action_header ON invoice_review_action ( header_id );
CREATE INDEX ix_notification_header ON notification ( header_id );
CREATE INDEX ix_notification_read ON notification ( is_read );

CREATE SEQUENCE file_seq       start with 1 increment by 1;
CREATE SEQUENCE inv_header_seq start with 1 increment by 1;
CREATE SEQUENCE inv_line_seq start with 1 increment by 1;