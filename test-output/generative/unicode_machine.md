# Unicode Machine

## Source
```machine
machine "Unicode Machine 🔄"
start "開始" {
    desc: "Starting point 开始";
}
process "処理" {
    desc: "Processing 处理";
}
end "終了";

start -"ユーザーイベント"-> process;
process -"完成"-> end;
```

## Mermaid Output
```mermaid
---
"title": "Unicode Machine 🔄"
config:
    class:
        hideEmptyMembersBox: true
---
classDiagram-v2
    class start["開始"] {
    
  }

  class process["処理"] {
    
  }

  class end["終了"] {
    
  }
    start --> process : ユーザーイベント

  process --> end : 完成
  
  

```

## JSON Output
```json
{
  "title": "Unicode Machine 🔄",
  "nodes": [
    {
      "name": "start",
      "attributes": [
        {
          "name": "desc",
          "value": "Starting point 开始"
        }
      ],
      "title": "開始"
    },
    {
      "name": "process",
      "attributes": [
        {
          "name": "desc",
          "value": "Processing 处理"
        }
      ],
      "title": "処理"
    },
    {
      "name": "end",
      "attributes": [],
      "title": "終了"
    }
  ],
  "edges": [
    {
      "source": "start",
      "target": "process",
      "value": {
        "text": "ユーザーイベント"
      },
      "attributes": {
        "text": "ユーザーイベント"
      },
      "arrowType": "->"
    },
    {
      "source": "process",
      "target": "end",
      "value": {
        "text": "完成"
      },
      "attributes": {
        "text": "完成"
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
