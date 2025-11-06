
### `complex-machine.dygram`

Complex Generated Machine

```dy examples/complex/complex-machine.dygram
machine "Complex Generated Machine"

context config {
    env<string>: "production";
    maxRetries<number>: 3;
    debug<boolean>: false;
    tags: ["generated", "test"];
}

init startup "System Start" {
    priority: "high";
    timeout: 10000;
}

task process1 {
    parallelism: 4;
}

task process2 {
    batchSize: 100;
}

state validation;
state cleanup;

workflow recovery {
    detect;
    analyze;
    fix;
    detect -> analyze -> fix;
}

startup -> process1;
process1 -> process2;
process2 -> validation;
validation -> cleanup;
process1 -on: error;-> recovery;
recovery -timeout: 30000;-> process1;
cleanup -if: '(config.debug == true)';-> startup;
```

### `context-heavy.dygram`

Context Heavy Machine

```dy examples/complex/context-heavy.dygram
machine "Context Heavy Machine"
context appConfig {
    environment<string>: "production";
    version<string>: "2.0.1";
    debug<boolean>: false;
    maxConnections<number>: 1000;
    features: ["auth", "logging", "metrics"];
}

context userPrefs {
    theme<string>: "dark";
    language<string>: "en-US";
    notifications<boolean>: true;
}

init bootstrap;
state ready;

bootstrap -> ready;
```

### `unicode-machine.dygram`

Unicode Machine 🔄

```dy examples/complex/unicode-machine.dygram
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
