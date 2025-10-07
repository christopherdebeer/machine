# Nested (3 levels)

## Source
```machine
machine "Nested Machine"
level1 {
    level2a {
        level3a;
        level3b;
    }
    level2b {
        level3c;
        level3d;
    }
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
  namespace level2as {
    class level3a {
      <<level2a>>
    }

    class level3b {
      <<level2a>>
    }
  }

  namespace level2bs {
    class level3c {
      <<level2b>>
    }

    class level3d {
      <<level2b>>
    }
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
      "name": "level3a",
      "type": "level2a",
      "attributes": []
    },
    {
      "name": "level3b",
      "type": "level2a",
      "attributes": []
    },
    {
      "name": "level2b",
      "type": "level1",
      "attributes": []
    },
    {
      "name": "level3c",
      "type": "level2b",
      "attributes": []
    },
    {
      "name": "level3d",
      "type": "level2b",
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
