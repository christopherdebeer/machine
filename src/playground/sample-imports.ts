/**
 * Sample Import Examples for Playground
 *
 * Provides pre-loaded multi-file examples demonstrating the import system
 */

export interface ImportExample {
    name: string;
    description: string;
    files: Record<string, string>;
    entryPoint: string;
}

export const IMPORT_EXAMPLES: ImportExample[] = [
    {
        name: "Basic Authentication Flow",
        description: "Simple two-file example with reusable authentication components",
        entryPoint: "/app.dygram",
        files: {
            "/lib.dygram": `// Authentication Library
machine "Auth Library"

state LoginPage "User Login"
state AuthService "Authentication"
state UserSession "Active Session"

LoginPage --> AuthService --> UserSession`,

            "/app.dygram": `// Main Application
import { LoginPage, UserSession } from "./lib.dygram"

machine "Main Application"

state Dashboard "User Dashboard"
state Profile "User Profile"

LoginPage --> Dashboard --> Profile --> UserSession`
        }
    },
    {
        name: "E-Commerce Workflow",
        description: "Multi-file example with cart, checkout, and payment modules",
        entryPoint: "/app.dygram",
        files: {
            "/cart.dygram": `// Shopping Cart Module
machine "Shopping Cart"

state BrowseCatalog "Browse Products"
state AddToCart "Add to Cart"
state ViewCart "View Cart"
state UpdateQuantity "Update Quantity"

BrowseCatalog --> AddToCart --> ViewCart
ViewCart --> UpdateQuantity --> ViewCart`,

            "/checkout.dygram": `// Checkout Module
machine "Checkout Process"

state ShippingInfo "Shipping Information"
state PaymentInfo "Payment Information"
state ReviewOrder "Review Order"
state ConfirmOrder "Confirm Order"

ShippingInfo --> PaymentInfo --> ReviewOrder --> ConfirmOrder`,

            "/app.dygram": `// Complete E-Commerce Application
import { ViewCart } from "./cart.dygram"
import { ShippingInfo, ConfirmOrder } from "./checkout.dygram"

machine "E-Commerce Platform"

state Home "Homepage"
state OrderComplete "Order Complete"
state ThankYou "Thank You"

Home --> ViewCart --> ShippingInfo --> ConfirmOrder --> OrderComplete --> ThankYou`
        }
    },
    {
        name: "Import Aliasing",
        description: "Demonstrates import aliasing to avoid name collisions",
        entryPoint: "/app.dygram",
        files: {
            "/module-a.dygram": `// Module A
machine "Module A"

state Start "Start State"
state Process "Process A"
state End "End State"

Start --> Process --> End`,

            "/module-b.dygram": `// Module B
machine "Module B"

state Start "Start State"
state Process "Process B"
state End "End State"

Start --> Process --> End`,

            "/app.dygram": `// Application Using Aliasing
import { Start as StartA, Process as ProcessA } from "./module-a.dygram"
import { Start as StartB, Process as ProcessB } from "./module-b.dygram"

machine "Combined Application"

state Init "Initialize"
state Final "Final State"

Init --> StartA --> ProcessA --> ProcessB --> StartB --> Final`
        }
    },
    {
        name: "Workflow Orchestration",
        description: "Complex example with multiple workflow stages",
        entryPoint: "/orchestrator.dygram",
        files: {
            "/data-ingestion.dygram": `// Data Ingestion Workflow
machine "Data Ingestion"

state FetchData "Fetch External Data"
state ValidateData "Validate Data"
state TransformData "Transform Data"
state StoreData "Store in Database"

FetchData --> ValidateData --> TransformData --> StoreData`,

            "/data-processing.dygram": `// Data Processing Workflow
machine "Data Processing"

state LoadData "Load Data"
state AnalyzeData "Analyze Data"
state GenerateReport "Generate Report"
state CacheResults "Cache Results"

LoadData --> AnalyzeData --> GenerateReport --> CacheResults`,

            "/notification.dygram": `// Notification System
machine "Notifications"

state PrepareMessage "Prepare Message"
state SendEmail "Send Email"
state SendSMS "Send SMS"
state LogNotification "Log Notification"

PrepareMessage --> SendEmail --> LogNotification
PrepareMessage --> SendSMS --> LogNotification`,

            "/orchestrator.dygram": `// Orchestrator
import { FetchData, StoreData } from "./data-ingestion.dygram"
import { LoadData, CacheResults } from "./data-processing.dygram"
import { PrepareMessage, LogNotification } from "./notification.dygram"

machine "Data Pipeline Orchestrator"

state Init "Initialize Pipeline"
state Complete "Pipeline Complete"
state Error "Error Handler"

Init --> FetchData --> StoreData --> LoadData
LoadData --> CacheResults --> PrepareMessage
PrepareMessage --> LogNotification --> Complete
FetchData --> Error
LoadData --> Error
PrepareMessage --> Error`
        }
    }
];

/**
 * Get a sample import example by name
 */
export function getImportExample(name: string): ImportExample | undefined {
    return IMPORT_EXAMPLES.find(ex => ex.name === name);
}

/**
 * Get the default import example
 */
export function getDefaultImportExample(): ImportExample {
    return IMPORT_EXAMPLES[0];
}

/**
 * Load an import example into a virtual filesystem
 */
export function loadExampleIntoVFS(example: ImportExample, vfs: { writeFile(path: string, content: string): void }): void {
    for (const [path, content] of Object.entries(example.files)) {
        vfs.writeFile(path, content);
    }
}
