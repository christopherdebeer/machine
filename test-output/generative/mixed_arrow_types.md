# Mixed Arrow Types

## Source
```machine
machine "Mixed Arrow Types"
a;
b;
c;
d;
e;

a -> b;
b --> c;
c => d;
d <--> e;
e -> a;
```

## Mermaid Output
```mermaid
---
"title": "Mixed Arrow Types"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class a {
    
  }

  class b {
    
  }

  class c {
    
  }

  class d {
    
  }

  class e {
    
  }
    a --> b

  b --> c

  c --> d

  d --> e

  e --> a

```

## JSON Output
```json
{
  "title": "Mixed Arrow Types",
  "nodes": [
    {
      "name": "a",
      "attributes": []
    },
    {
      "name": "b",
      "attributes": []
    },
    {
      "name": "c",
      "attributes": []
    },
    {
      "name": "d",
      "attributes": []
    },
    {
      "name": "e",
      "attributes": []
    }
  ],
  "edges": [
    {
      "source": "a",
      "target": "b"
    },
    {
      "source": "b",
      "target": "c"
    },
    {
      "source": "c",
      "target": "d"
    },
    {
      "source": "d",
      "target": "e"
    },
    {
      "source": "e",
      "target": "a"
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
