# State Machine Examples

State transitions and stateful workflows.

## Simple State Machine

Basic state transitions:

```dygram
machine "Traffic Light"

State red "Red Light";
State yellow "Yellow Light";
State green "Green Light";

red -30s-> green;
green -25s-> yellow;
yellow -5s-> red;
```

State machine basics:
- `State` nodes represent distinct states
- Edge labels (`30s`, `25s`, `5s`) indicate transition conditions/timing
- Cyclic transitions create a loop

## Stateful Workflow

Combining tasks and states:

```dygram
machine "Order Processing"

State pending "Order Pending";
State processing "Processing Order";
State shipped "Order Shipped";
State delivered "Order Delivered";

Task validate "Validate order";
Task prepare "Prepare shipment";
Task ship "Ship order";

pending -> validate -> processing;
processing -> prepare -> shipped;
shipped -> ship -> delivered;
```

Pattern notes:
- Mix of `State` and `Task` nodes
- Tasks trigger state transitions
- Linear progression through states

## Multi-Path State Machine

States with conditional transitions:

```dygram
machine "Document Approval"

State draft "Draft";
State review "Under Review";
State approved "Approved";
State rejected "Rejected";
State published "Published";

Task submit "Submit for review";
Task approveTask "Approve document";
Task rejectTask "Reject document";
Task publish "Publish document";
Task revise "Revise document";

draft -> submit -> review;
review -> approveTask -> approved;
review -> rejectTask -> rejected;
approved -> publish -> published;
rejected -> revise -> draft;
```

Multi-path features:
- Multiple possible transitions from a state
- Rejection loop back to draft
- Final state (`published`)

## State Machine with Guards

Using annotations for transition conditions:

```dygram
machine "Smart Thermostat"

State idle "Idle";
State heating "Heating";
State cooling "Cooling";

Task checkTemp "Check temperature";
Task heatOn "Turn heater on";
Task coolOn "Turn AC on";
Task turnOff "Turn off";

idle -> checkTemp;
checkTemp -"temp < 68"-> heatOn -> heating;
checkTemp -"temp > 72"-> coolOn -> cooling;
heating -> checkTemp;
cooling -> checkTemp;
checkTemp -"68 <= temp <= 72"-> turnOff -> idle;
```

Guard pattern:
- Edge labels express transition conditions
- Multiple conditions from same state
- Continuous monitoring with loops

## Hierarchical State Machine

Nested states with substates:

```dygram
machine "Connection Manager"

State disconnected "Disconnected";

State connected "Connected" {
    State authenticating "Authenticating";
    State authenticated "Authenticated";
    State active "Active";

    authenticating -> authenticated -> active;
};

State error "Error State";

Task connect "Establish connection";
Task authenticate "Authenticate user";
Task disconnect "Disconnect";
Task handleError "Handle error";

disconnected -> connect -> connected.authenticating;
connected.active -> disconnect -> disconnected;
connected -> handleError -> error;
error -> connect -> connected.authenticating;
```

Hierarchical features:
- `State` can contain nested states
- Qualified references: `connected.authenticating`
- Transitions can target nested states
- Error handling with recovery path

## State Machine with Context

Stateful processing with shared context:

```dygram
machine "Game Session"

Context session {
    score<number>: 0;
    lives<number>: 3;
    level<number>: 1;
};

State playing "Playing";
State paused "Paused";
State gameOver "Game Over";
State victory "Victory";

Task updateScore "Update score" {
    prompt: "Current score: {{ session.score }}";
};

Task checkWinCondition "Check win";
Task checkLoseCondition "Check lose";

playing -> updateScore -> checkWinCondition;
checkWinCondition -"score >= 1000"-> victory;
checkWinCondition -"score < 1000"-> checkLoseCondition;
checkLoseCondition -"lives <= 0"-> gameOver;
checkLoseCondition -"lives > 0"-> playing;
```

Context integration:
- `Context` node stores shared state
- Template syntax accesses context: `{{ session.score }}`
- Generic types: `<number>` for type safety
- Conditions reference context values

## Next Steps

- **[LLM Integration](./llm-integration.md)** - Add AI to state machines
- **[Advanced Features](./advanced-features.md)** - More complex patterns
- **[Workflows](./workflows.md)** - Workflow patterns
