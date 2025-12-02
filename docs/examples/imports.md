# Import System Examples

Comprehensive examples demonstrating the DyGram import system for multi-file projects.

## Table of Contents

1. [Basic Imports](#basic-imports)
2. [Authentication Flow](#authentication-flow)
3. [E-Commerce Platform](#e-commerce-platform)
4. [Workflow Orchestration](#workflow-orchestration)
5. [Multi-Team Collaboration](#multi-team-collaboration)
6. [Import Aliasing Patterns](#import-aliasing-patterns)
7. [Advanced Patterns](#advanced-patterns)

## Basic Imports

### Simple Library and Consumer

Create a reusable library of authentication components:

```dy examples/imports/simple-library.dygram
machine "Auth Library"

state LoginPage "User Login"
state AuthService "Authentication"
state UserSession "Active Session"

LoginPage --> AuthService --> UserSession
```

Import and use the library components:

```dy examples/imports/simple-consumer.dygram
import { LoginPage, UserSession } from "./simple-library.dy"

machine "Main Application"

state Dashboard "User Dashboard"
state Profile "User Profile"

LoginPage --> Dashboard --> Profile --> UserSession
```

## Authentication Flow

### Complete Authentication System

Build a comprehensive authentication system across multiple files.

**Session Management** (`auth/session.dy`):

```dy examples/imports/auth-session.dygram
machine "Session Management"

state CreateSession "Create Session"
state ValidateSession "Validate Session"
state RefreshSession "Refresh Session"
state EndSession "End Session"

CreateSession --> ValidateSession
ValidateSession --> RefreshSession --> ValidateSession
ValidateSession --> EndSession
```

**Login Flow** (`auth/login.dy`):

```dy examples/imports/auth-login.dygram
machine "Login Flow"

state LoginForm "Login Form"
state ValidateCredentials "Validate Credentials"
state TwoFactorAuth "Two-Factor Authentication"
state LoginSuccess "Login Success"
state LoginFailure "Login Failed"

LoginForm --> ValidateCredentials
ValidateCredentials -success-> TwoFactorAuth --> LoginSuccess
ValidateCredentials -failure-> LoginFailure
```

**Main Application** (`app.dy`):

```dy examples/imports/auth-main.dygram
import { LoginForm, LoginSuccess } from "./auth-login.dy"
import { CreateSession, ValidateSession } from "./auth-session.dy"

machine "Secure Application"

state Home "Homepage"
state SecureArea "Secure Area"
state Logout "Logout"

Home --> LoginForm --> LoginSuccess --> CreateSession
CreateSession --> SecureArea
SecureArea --> ValidateSession --> SecureArea
SecureArea --> Logout
```

## E-Commerce Platform

### Multi-Module Shopping System

Create a complete e-commerce platform with separate modules for different concerns.

**Product Catalog** (`ecommerce/catalog.dy`):

```dy examples/imports/ecommerce-catalog.dygram
machine "Product Catalog"

state BrowseProducts "Browse Products"
state SearchProducts "Search Products"
state ViewProduct "View Product Details"
state CompareProducts "Compare Products"
state AddToWishlist "Add to Wishlist"

BrowseProducts --> ViewProduct
SearchProducts --> ViewProduct
ViewProduct --> CompareProducts
ViewProduct --> AddToWishlist
```

**Shopping Cart** (`ecommerce/cart.dy`):

```dy examples/imports/ecommerce-cart.dygram
machine "Shopping Cart"

state ViewCart "View Cart"
state AddItem "Add Item"
state RemoveItem "Remove Item"
state UpdateQuantity "Update Quantity"
state ApplyCoupon "Apply Coupon"
state CalculateTotal "Calculate Total"

AddItem --> ViewCart
ViewCart --> RemoveItem --> ViewCart
ViewCart --> UpdateQuantity --> CalculateTotal --> ViewCart
ViewCart --> ApplyCoupon --> CalculateTotal
```

**Checkout Process** (`ecommerce/checkout.dy`):

```dy examples/imports/ecommerce-checkout.dygram
machine "Checkout Process"

state ShippingAddress "Shipping Address"
state ShippingMethod "Shipping Method"
state PaymentInfo "Payment Information"
state ReviewOrder "Review Order"
state ProcessPayment "Process Payment"
state OrderConfirmation "Order Confirmation"

ShippingAddress --> ShippingMethod --> PaymentInfo
PaymentInfo --> ReviewOrder --> ProcessPayment
ProcessPayment -success-> OrderConfirmation
ProcessPayment -failure-> PaymentInfo
```

**Complete Platform** (`ecommerce/platform.dy`):

```dy examples/imports/ecommerce-platform.dygram
import { BrowseProducts, ViewProduct } from "./ecommerce-catalog.dy"
import { AddItem, ViewCart, CalculateTotal } from "./ecommerce-cart.dy"
import { ShippingAddress, OrderConfirmation } from "./ecommerce-checkout.dy"

machine "E-Commerce Platform"

state Home "Homepage"
state UserProfile "User Profile"
state OrderHistory "Order History"
state CustomerSupport "Customer Support"

Home --> BrowseProducts --> ViewProduct --> AddItem
AddItem --> ViewCart --> CalculateTotal --> ShippingAddress
ShippingAddress --> OrderConfirmation --> OrderHistory
Home --> UserProfile --> OrderHistory
Home --> CustomerSupport
```

## Workflow Orchestration

### Data Pipeline Orchestration

Build a complex data processing pipeline with multiple stages.

**Data Ingestion** (`pipeline/ingestion.dy`):

```dy examples/imports/pipeline-ingestion.dygram
machine "Data Ingestion"

state FetchExternal "Fetch External Data"
state ValidateFormat "Validate Format"
state SanitizeData "Sanitize Data"
state DetectSchema "Detect Schema"
state StoreRaw "Store Raw Data"

FetchExternal --> ValidateFormat --> SanitizeData
SanitizeData --> DetectSchema --> StoreRaw
```

**Data Transformation** (`pipeline/transformation.dy`):

```dy examples/imports/pipeline-transformation.dygram
machine "Data Transformation"

state LoadRaw "Load Raw Data"
state ParseData "Parse Data"
state TransformStructure "Transform Structure"
state EnrichData "Enrich Data"
state ValidateOutput "Validate Output"
state StoreProcessed "Store Processed Data"

LoadRaw --> ParseData --> TransformStructure
TransformStructure --> EnrichData --> ValidateOutput
ValidateOutput --> StoreProcessed
```

**Data Analysis** (`pipeline/analysis.dy`):

```dy examples/imports/pipeline-analysis.dygram
machine "Data Analysis"

state LoadProcessed "Load Processed Data"
state ComputeMetrics "Compute Metrics"
state GenerateInsights "Generate Insights"
state CreateVisualizations "Create Visualizations"
state PublishResults "Publish Results"

LoadProcessed --> ComputeMetrics --> GenerateInsights
GenerateInsights --> CreateVisualizations --> PublishResults
```

**Notification System** (`pipeline/notifications.dy`):

```dy examples/imports/pipeline-notifications.dygram
machine "Notifications"

state PrepareMessage "Prepare Message"
state SendEmail "Send Email"
state SendSlack "Send Slack Message"
state LogNotification "Log Notification"
state UpdateDashboard "Update Dashboard"

PrepareMessage --> SendEmail --> LogNotification
PrepareMessage --> SendSlack --> LogNotification
LogNotification --> UpdateDashboard
```

**Pipeline Orchestrator** (`pipeline/orchestrator.dy`):

```dy examples/imports/pipeline-orchestrator.dygram
import { FetchExternal, StoreRaw } from "./pipeline-ingestion.dy"
import { LoadRaw, StoreProcessed } from "./pipeline-transformation.dy"
import { LoadProcessed, PublishResults } from "./pipeline-analysis.dy"
import { PrepareMessage, UpdateDashboard } from "./pipeline-notifications.dy"

machine "Data Pipeline Orchestrator"

state Initialize "Initialize Pipeline"
state Monitor "Monitor Progress"
state HandleError "Handle Error"
state Complete "Pipeline Complete"
state Archive "Archive Results"

Initialize --> FetchExternal --> StoreRaw --> LoadRaw
LoadRaw --> StoreProcessed --> LoadProcessed
LoadProcessed --> PublishResults --> PrepareMessage
PrepareMessage --> UpdateDashboard --> Complete
Complete --> Archive

FetchExternal -error-> HandleError
LoadRaw -error-> HandleError
LoadProcessed -error-> HandleError
HandleError --> PrepareMessage
```

## Multi-Team Collaboration

### Large System with Team Boundaries

Demonstrate how different teams can work on separate modules.

**Team A: Frontend Components** (`teams/frontend.dy`):

```dy examples/imports/teams-frontend.dygram
machine "Frontend Components"

state LandingPage "Landing Page"
state NavigationBar "Navigation Bar"
state SearchInterface "Search Interface"
state ProductDisplay "Product Display"
state UserDashboard "User Dashboard"

LandingPage --> NavigationBar
LandingPage --> SearchInterface --> ProductDisplay
LandingPage --> UserDashboard
```

**Team B: Backend Services** (`teams/backend.dy`):

```dy examples/imports/teams-backend.dygram
machine "Backend Services"

state APIGateway "API Gateway"
state AuthService "Authentication Service"
state DatabaseLayer "Database Layer"
state CacheLayer "Cache Layer"
state EventBus "Event Bus"

APIGateway --> AuthService
APIGateway --> DatabaseLayer
DatabaseLayer --> CacheLayer
APIGateway --> EventBus
```

**Team C: Business Logic** (`teams/business.dy`):

```dy examples/imports/teams-business.dygram
machine "Business Logic"

state ValidateOrder "Validate Order"
state CalculatePricing "Calculate Pricing"
state ApplyDiscounts "Apply Discounts"
state ProcessPayment "Process Payment"
state UpdateInventory "Update Inventory"

ValidateOrder --> CalculatePricing --> ApplyDiscounts
ApplyDiscounts --> ProcessPayment --> UpdateInventory
```

**System Integration** (`teams/integration.dy`):

```dy examples/imports/teams-integration.dygram
import { LandingPage, ProductDisplay, UserDashboard } from "./teams-frontend.dy"
import { APIGateway, AuthService, DatabaseLayer } from "./teams-backend.dy"
import { ValidateOrder, ProcessPayment, UpdateInventory } from "./teams-business.dy"

machine "Integrated System"

state SystemStart "System Start"
state SystemReady "System Ready"

SystemStart --> LandingPage
LandingPage --> APIGateway --> AuthService
APIGateway --> DatabaseLayer

ProductDisplay --> ValidateOrder --> ProcessPayment
ProcessPayment --> UpdateInventory --> DatabaseLayer

UserDashboard --> APIGateway
UpdateInventory --> SystemReady
```

## Import Aliasing Patterns

### Handling Name Collisions

When multiple modules export symbols with the same name, use import aliasing.

**Module A** (`collision/module-a.dy`):

```dy examples/imports/collision-module-a.dygram
machine "Module A"

state Initialize "Initialize A"
state Process "Process A"
state Validate "Validate A"
state Complete "Complete A"

Initialize --> Process --> Validate --> Complete
```

**Module B** (`collision/module-b.dy`):

```dy examples/imports/collision-module-b.dygram
machine "Module B"

state Initialize "Initialize B"
state Process "Process B"
state Validate "Validate B"
state Complete "Complete B"

Initialize --> Process --> Validate --> Complete
```

**Module C** (`collision/module-c.dy`):

```dy examples/imports/collision-module-c.dygram
machine "Module C"

state Initialize "Initialize C"
state Process "Process C"
state Validate "Validate C"
state Complete "Complete C"

Initialize --> Process --> Validate --> Complete
```

**Application with Aliasing** (`collision/app.dy`):

```dy examples/imports/collision-app.dygram
import { Initialize as InitA, Process as ProcessA, Complete as CompleteA } from "./collision-module-a.dy"
import { Initialize as InitB, Process as ProcessB, Complete as CompleteB } from "./collision-module-b.dy"
import { Initialize as InitC, Process as ProcessC, Complete as CompleteC } from "./collision-module-c.dy"

machine "Multi-Module Application"

state Start "Application Start"
state Merge "Merge Results"
state End "Application End"

Start --> InitA --> ProcessA --> CompleteA --> Merge
Start --> InitB --> ProcessB --> CompleteB --> Merge
Start --> InitC --> ProcessC --> CompleteC --> Merge
Merge --> End
```

## Advanced Patterns

### Hierarchical Imports with Qualified Names

Use qualified names for better organization:

```dy examples/imports/hierarchical-lib.dygram
machine "Hierarchical Library"

Process Authentication {
    state Login "Login"
    state Verify "Verify"
    state Session "Session"

    Login --> Verify --> Session
}

Process Authorization {
    state CheckPermissions "Check Permissions"
    state GrantAccess "Grant Access"
    state DenyAccess "Deny Access"

    CheckPermissions --> GrantAccess
    CheckPermissions --> DenyAccess
}
```

Import nested nodes using qualified names:

```dy examples/imports/hierarchical-app.dygram
import { Authentication.Login, Authentication.Session } from "./hierarchical-lib.dy"
import { Authorization.CheckPermissions, Authorization.GrantAccess } from "./hierarchical-lib.dy"

machine "Secure Application"

state Home "Home"
state Protected "Protected Resource"
state Success "Access Granted"

Home --> Authentication.Login --> Authentication.Session
Authentication.Session --> Authorization.CheckPermissions
Authorization.CheckPermissions --> Authorization.GrantAccess --> Protected --> Success
```

### Layered Architecture

Organize imports by architectural layers:

**Data Layer** (`layers/data.dy`):

```dy examples/imports/layers-data.dygram
machine "Data Layer"

state DatabaseConnect "Database Connection"
state QueryExecute "Execute Query"
state ResultTransform "Transform Result"
state CacheUpdate "Update Cache"

DatabaseConnect --> QueryExecute --> ResultTransform --> CacheUpdate
```

**Business Layer** (`layers/business.dy`):

```dy examples/imports/layers-business.dygram
import { QueryExecute, ResultTransform } from "./layers-data.dy"

machine "Business Layer"

state ValidateInput "Validate Input"
state ApplyRules "Apply Business Rules"
state ExecuteLogic "Execute Logic"

ValidateInput --> ApplyRules --> ExecuteLogic
ExecuteLogic --> QueryExecute --> ResultTransform
```

**Presentation Layer** (`layers/presentation.dy`):

```dy examples/imports/layers-presentation.dygram
import { ValidateInput } from "./layers-business.dy"
import { ResultTransform } from "./layers-data.dy"

machine "Presentation Layer"

state RenderUI "Render UI"
state HandleInput "Handle User Input"
state DisplayResult "Display Result"

RenderUI --> HandleInput --> ValidateInput
ValidateInput --> ResultTransform --> DisplayResult --> RenderUI
```

## Best Practices Summary

### 1. Keep Modules Focused

Each file should have a single, clear purpose:

```
✅ auth.dy         - Authentication only
✅ cart.dy         - Shopping cart logic
❌ auth-cart-user.dy - Multiple concerns (avoid)
```

### 2. Use Meaningful Names

Choose descriptive names that indicate purpose:

```
✅ ecommerce-checkout.dygram
✅ data-pipeline-ingestion.dygram
❌ module1.dygram
❌ temp.dygram
```

### 3. Organize by Feature or Domain

```
/auth/
  login.dygram
  session.dygram
/payment/
  checkout.dygram
  processing.dygram
```

### 4. Document Module Boundaries

Use machine names and comments to clarify module purpose:

```dy
machine "Authentication Module"
// Provides login, session management, and two-factor authentication
// Used by: app.dy, admin.dygram
```

### 5. Minimize Cross-Module Dependencies

Keep import chains shallow and dependencies clear:

```
✅ app.dy → auth.dygram
✅ app.dy → cart.dygram
❌ app.dy → utils.dy → helpers.dy → core.dygram
```

## CLI Usage

### Generate with Imports

```bash
dygram generate app.dy --format html
# Automatically resolves all imports
```

### Check Dependency Graph

```bash
dygram check-imports app.dygram
# Output:
# app.dygram
#   → auth-login.dygram
#   → auth-session.dygram
#   → ecommerce-cart.dygram
```

### Bundle Multi-File Project

```bash
dygram bundle app.dy --output dist/app.bundled.dygram
# Creates single file with all imports merged
```

## See Also

- **[Import Syntax Reference](../syntax/imports.md)** - Complete syntax documentation
- **[Qualified Names](../syntax/qualified-names.md)** - Dot notation for nested references
- **[CLI Reference](../cli/README.md)** - Command-line tools

---

**Try it yourself**: Load these examples in the [CodeMirror Playground](../../playground-mobile.html) with VFS mode enabled.
