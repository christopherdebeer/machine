# Order Processing

## Source
```machine
machine "E-Commerce Order Processing"

init start;

// Order states
State new_order {
    desc: "Order received";
    priority<number>: 1;
};

State payment_pending {
    desc: "Awaiting payment";
};

State payment_confirmed {
    desc: "Payment successful";
};

State preparing {
    desc: "Order being prepared";
};

State shipped {
    desc: "Order shipped to customer";
};

State delivered {
    desc: "Order delivered";
};

State cancelled {
    desc: "Order cancelled";
};

State refunded {
    desc: "Order refunded";
};

start -> new_order;

// Happy path
new_order -create-> payment_pending;
payment_pending -pay-> payment_confirmed;
payment_confirmed -prepare-> preparing;
preparing -ship-> shipped;
shipped -deliver-> delivered;

// Alternative flows
payment_pending -timeout: 900;-> cancelled;
payment_confirmed -cancel_request-> refunded;
preparing -cancel_request-> refunded;

```

## Mermaid Output
```mermaid
---
"title": "E-Commerce Order Processing"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class start {
    <<init>>
  }

namespace States {
  class new_order["Order received"] {
    <<State>>
    +priority : number = 1
  }

  class payment_pending["Awaiting payment"] {
    <<State>>
  }

  class payment_confirmed["Payment successful"] {
    <<State>>
  }

  class preparing["Order being prepared"] {
    <<State>>
  }

  class shipped["Order shipped to customer"] {
    <<State>>
  }

  class delivered["Order delivered"] {
    <<State>>
  }

  class cancelled["Order cancelled"] {
    <<State>>
  }

  class refunded["Order refunded"] {
    <<State>>
  }
}
    start --> new_order

  new_order --> payment_pending : create

  payment_pending --> payment_confirmed : pay

  payment_confirmed --> preparing : prepare

  preparing --> shipped : ship

  shipped --> delivered : deliver

  payment_pending --> cancelled : timeout=900

  payment_confirmed --> refunded : cancel_request

  preparing --> refunded : cancel_request
  
  

```

## JSON Output
```json
{
  "title": "E-Commerce Order Processing",
  "nodes": [
    {
      "name": "start",
      "type": "init",
      "attributes": []
    },
    {
      "name": "new_order",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order received"
        },
        {
          "name": "priority",
          "type": "number",
          "value": "1"
        }
      ]
    },
    {
      "name": "payment_pending",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Awaiting payment"
        }
      ]
    },
    {
      "name": "payment_confirmed",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Payment successful"
        }
      ]
    },
    {
      "name": "preparing",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order being prepared"
        }
      ]
    },
    {
      "name": "shipped",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order shipped to customer"
        }
      ]
    },
    {
      "name": "delivered",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order delivered"
        }
      ]
    },
    {
      "name": "cancelled",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order cancelled"
        }
      ]
    },
    {
      "name": "refunded",
      "type": "State",
      "attributes": [
        {
          "name": "desc",
          "value": "Order refunded"
        }
      ]
    }
  ],
  "edges": [
    {
      "source": "start",
      "target": "new_order",
      "arrowType": "->"
    },
    {
      "source": "new_order",
      "target": "payment_pending",
      "value": {
        "text": "create"
      },
      "attributes": {
        "text": "create"
      },
      "arrowType": "->"
    },
    {
      "source": "payment_pending",
      "target": "payment_confirmed",
      "value": {
        "text": "pay"
      },
      "attributes": {
        "text": "pay"
      },
      "arrowType": "->"
    },
    {
      "source": "payment_confirmed",
      "target": "preparing",
      "value": {
        "text": "prepare"
      },
      "attributes": {
        "text": "prepare"
      },
      "arrowType": "->"
    },
    {
      "source": "preparing",
      "target": "shipped",
      "value": {
        "text": "ship"
      },
      "attributes": {
        "text": "ship"
      },
      "arrowType": "->"
    },
    {
      "source": "shipped",
      "target": "delivered",
      "value": {
        "text": "deliver"
      },
      "attributes": {
        "text": "deliver"
      },
      "arrowType": "->"
    },
    {
      "source": "payment_pending",
      "target": "cancelled",
      "value": {
        "text": "timeout: 900;",
        "timeout": "900"
      },
      "attributes": {
        "text": "timeout: 900;",
        "timeout": "900"
      },
      "arrowType": "->"
    },
    {
      "source": "payment_confirmed",
      "target": "refunded",
      "value": {
        "text": "cancel_request"
      },
      "attributes": {
        "text": "cancel_request"
      },
      "arrowType": "->"
    },
    {
      "source": "preparing",
      "target": "refunded",
      "value": {
        "text": "cancel_request"
      },
      "attributes": {
        "text": "cancel_request"
      },
      "arrowType": "->"
    }
  ],
  "notes": [],
  "inferredDependencies": []
}
```

## Validation Status
- Passed: true
- Parse Errors: 0
- Transform Errors: 0
- Completeness Issues: 0
- Losslessness Issues: 0
- Mermaid Parse Errors: 0
