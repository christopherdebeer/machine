# Labeled Edges

## Source
```machine
machine "Labeled Edges Machine"
start;
middle;
end;
error;

start -init-> middle;
middle -"process complete"-> end;
middle -timeout: 5000;-> error;
error -retry: 3; logLevel: 0;-> start;
end -if: '(count > 10)';-> start;
```

## Mermaid Output
```mermaid
---
"title": "Labeled Edges Machine"
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
    start --> middle : init

  middle --> end : process complete

  middle --> error : timeout: 5000;, timeout=5000

  error --> start : retry: 3; logLevel: 0;, retry=3, logLevel=0

  end --> start : if=(count > 10)

```

## JSON Output
```json
{
  "title": "Labeled Edges Machine",
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
        "text": "init"
      },
      "attributes": {
        "text": "init"
      }
    },
    {
      "source": "middle",
      "target": "end",
      "value": {
        "text": "process complete"
      },
      "attributes": {
        "text": "process complete"
      }
    },
    {
      "source": "middle",
      "target": "error",
      "value": {
        "text": "timeout: 5000;",
        "timeout": "5000"
      },
      "attributes": {
        "text": "timeout: 5000;",
        "timeout": "5000"
      }
    },
    {
      "source": "error",
      "target": "start",
      "value": {
        "text": "retry: 3; logLevel: 0;",
        "retry": "3",
        "logLevel": "0"
      },
      "attributes": {
        "text": "retry: 3; logLevel: 0;",
        "retry": "3",
        "logLevel": "0"
      }
    },
    {
      "source": "end",
      "target": "start",
      "value": {
        "if": "(count > 10)"
      },
      "attributes": {
        "if": "(count > 10)"
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
