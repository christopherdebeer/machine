# Test Observations: Dynamic Tool Creation Example

**Date:** 2025-12-02
**Machine:** `examples/meta-programming/dynamic-tool-creation.dy`
**Execution ID:** `test-dynamic-001`
**Tester:** Sub-agent + Manual validation

## Executive Summary

The CLI interactive testing workflow **works mechanically** but reveals **critical gaps** in both execution behavior and documentation that prevent effective testing of meta-programming examples.

## Key Findings

### 1. Critical Execution Issue: Tasks Skip LLM Invocation

**Observed Behavior:**
- Turn 1 (assessToolNeed): Auto-transitioned without LLM invocation
- Turn 2 (buildTools): Auto-transitioned without LLM invocation
- Turn 3 (useTools): **Finally** triggered LLM invocation

**Root Cause:**
Tasks with prompts are skipping LLM invocation when:
- Only one outbound transition exists
- No context writes or meta operations detected
- Optimization logic: "Only transition tool available, no context writes or meta operations"

**Impact:**
- `assessToolNeed` never executes its prompt
- `buildTools` never executes `construct_tool` to create the parse_csv tool
- `useTools` waits for a tool that was never created
- Meta-programming examples **fundamentally broken**

**Log Evidence:**
```
[transition] Single transition with no other work: assessToolNeed -> buildTools
  (auto-taking, skipping LLM) {
  reason: 'Only transition tool available, no context writes or meta operations'
}
```

### 2. Missing Tools in LLM Request

**Observed:**
- LLM request shows `"tools": []`
- Even when meta-tools should be available (construct_tool, get_machine_definition)

**Expected:**
- Meta-tools should be available to tasks
- Transition tools should be provided
- Dynamically created tools should persist

**Impact:**
- Agent has no way to accomplish objectives
- Instructions say "use parse_csv tool" but tool doesn't exist
- Instructions say "use transition tool" but no transition tools provided

### 3. Agent/Skill Documentation Gaps

#### What Works Well:
✅ Overall workflow structure is clear
✅ CLI command patterns are well documented
✅ State management concepts are explained
✅ Recording/playback concepts are covered

#### Critical Gaps Identified:

**A. No Stdin Response Format Guidance**
- The CLI shows waiting for response via stdin
- Example response format is generic
- **Missing:** How to structure response for this specific request
- **Missing:** What to do when tools array is empty
- **Missing:** How to provide intelligent response vs just continuing

**B. Recording Mode Confusion**
The docs say:
```bash
dygram e -i machine.dygram --record recordings/test/ --id test
```

But don't explain:
- What client mode is used (`InteractiveTestClient`)
- That it creates a file queue (`.dygram-interactive-queue/`)
- How responses are coordinated via the queue
- That the CLI exits immediately waiting for external responder

**C. No Guidance for Blocked Execution**
When execution is blocked (no tools, missing capabilities):
- **Missing:** Troubleshooting steps
- **Missing:** How to identify what went wrong
- **Missing:** How to provide "give up" or "skip" response

**D. Grammar Warnings Spam**
Every execution prints:
```
Ambiguous Alternatives Detected: <1, 1, 1, 1, ...> in <OR2> inside <Machine​> Rule
```
- Adds noise to output
- Not explained in docs
- Should be verbose-only

### 4. Agent Instructions Need Clarification

**Current State:**
The agent guide says to "provide intelligent responses when LLM decisions are needed" but doesn't explain:

1. **When are LLM decisions needed?**
   - Tasks with prompts should invoke LLM
   - But optimization skips them
   - When to expect LLM invocation?

2. **What if tools are missing?**
   - Example says "use parse_csv tool"
   - But tool doesn't exist
   - Should agent create it? How?

3. **How to handle meta-operations?**
   - No examples of providing meta-tool responses
   - Format for construct_tool responses unclear
   - How do dynamically created tools work?

## Recommendations

### High Priority (Blocking Issues)

1. **Fix Task Execution Logic**
   - Tasks with prompts should **always** invoke LLM
   - Don't skip LLM based on transition count
   - Optimization should be opt-in, not default

2. **Provide Meta-Tools to Tasks**
   - Tasks should have access to meta-tools
   - Document which meta-tools are available when
   - Persist dynamically created tools across turns

3. **Update Agent Guide with Stdin Response Examples**
   ```markdown
   ## Providing Responses via Stdin

   When CLI shows "Waiting for LLM response...", provide:

   ```bash
   echo '{
     "type": "llm_response",
     "requestId": "<from-request>",
     "reasoning": "Why you chose this action",
     "response": {
       "id": "response-1",
       "model": "cli-interactive",
       "role": "assistant",
       "content": [
         {"type": "text", "text": "Your reasoning"},
         {"type": "tool_use", "id": "tool-1", "name": "tool_name", "input": {...}}
       ],
       "stop_reason": "tool_use"
     }
   }' | dygram e -i machine.dygram --id test-001
   ```
   ```

4. **Document Recording Mode Client Behavior**
   - Explain InteractiveTestClient vs StdinResponseClient
   - Show file-queue coordination
   - Provide example of external responder coordination

### Medium Priority

5. **Suppress Grammar Warnings by Default**
   - Move to `--verbose` mode
   - Only show in development builds

6. **Add Troubleshooting Section**
   - How to identify blocked execution
   - How to recover from missing tools
   - How to skip/abort turns

7. **Provide Meta-Programming Response Examples**
   - Example: construct_tool response
   - Example: update_definition response
   - Example: Handling empty tools array

### Low Priority

8. **Add Convenience Features**
   - `--loop` flag for continuous execution
   - Response template generator
   - Better error messages for common issues

## Test Artifacts

- **Execution State:** `.dygram/executions/test-dynamic-001/`
- **History:** 2 completed turns (both auto-transitioned)
- **Current Status:** Blocked waiting for response with no tools

## Conclusion

**Testing Infrastructure:** ✅ Solid foundation
**Documentation:** ⚠️ Good structure, critical gaps
**Execution Behavior:** ❌ Fundamentally broken for meta-programming

**The CLI interactive mode works for simple workflows but fails for meta-programming examples due to task execution optimization that skips LLM invocation.**

Priority should be:
1. Fix task execution logic (CRITICAL)
2. Update agent/skill docs with stdin examples (HIGH)
3. Document recording mode behavior (HIGH)
4. Add meta-programming response examples (MEDIUM)
