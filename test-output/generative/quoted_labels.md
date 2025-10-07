# Quoted Labels

## Source
```machine
machine "Quoted Labels Machine"
start;
middle;
end;
error;

start -"user clicks button"-> middle;
middle -"validation: passed; retry: 3;"-> end;
middle -"error: timeout"-> error;
error -"retry attempt"-> start;
```

## Mermaid Output
```mermaid
---
"title": "Quoted Labels Machine"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class start {
    
  }

  class middle {
    
  }

  class end {
    
  }

  class error {
    
  }
    start --> middle : user clicks button

  middle --> end : validation: passed; retry: 3;

  middle --> error : error: timeout

  error --> start : retry attempt

```

## JSON Output
```json
{
  "title": "Quoted Labels Machine",
  "nodes": [
    {
      "name": "start",
      "attributes": []
    },
    {
      "name": "middle",
      "attributes": []
    },
    {
      "name": "end",
      "attributes": []
    },
    {
      "name": "error",
      "attributes": []
    }
  ],
  "edges": [
    {
      "source": "start",
      "target": "middle",
      "value": {
        "text": "user clicks button"
      },
      "attributes": {
        "text": "user clicks button"
      }
    },
    {
      "source": "middle",
      "target": "end",
      "value": {
        "text": "validation: passed; retry: 3;"
      },
      "attributes": {
        "text": "validation: passed; retry: 3;"
      }
    },
    {
      "source": "middle",
      "target": "error",
      "value": {
        "text": "error: timeout"
      },
      "attributes": {
        "text": "error: timeout"
      }
    },
    {
      "source": "error",
      "target": "start",
      "value": {
        "text": "retry attempt"
      },
      "attributes": {
        "text": "retry attempt"
      }
    }
  ]
}
```

## Validation Status
- Passed: true
- Parse Errors: 0
- Transform Errors: 0
- Completeness Issues: 0
- Losslessness Issues: 0
- Mermaid Parse Errors: 0
