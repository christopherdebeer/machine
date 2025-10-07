# Nested (2 levels)

## Source
```machine
machine "Nested Machine"
level1 {
    level2a;
    level2b;
}
```

## Mermaid Output
```mermaid
---
"title": "Nested Machine"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class level1 {
    
  }

namespace level1s {
  class level2a {
    <<level1>>
  }

  class level2b {
    <<level1>>
  }
}
  undefined

```

## JSON Output
```json
{
  "title": "Nested Machine",
  "nodes": [
    {
      "name": "level1",
      "attributes": []
    },
    {
      "name": "level2a",
      "type": "level1",
      "attributes": []
    },
    {
      "name": "level2b",
      "type": "level1",
      "attributes": []
    }
  ],
  "edges": []
}
```

## Validation Status
- Passed: true
- Parse Errors: 0
- Transform Errors: 0
- Completeness Issues: 0
- Losslessness Issues: 0
- Mermaid Parse Errors: 0
