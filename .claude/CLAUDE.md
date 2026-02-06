# Rules for Claude Code

The following rules should be treated as gospel. Do not deviate from them under any circumstances.

1. Only comment "why", never "what". Your code should be clear and concise such that the "what" is self-evident. Comments should be reserved for two cases:
   - To explain the reasoning behind a specific implementation choice when that choice is strange or unintuitive.
   - Docstrings for public functions in which the function name and signature do not provide sufficient context.
2. If a test is failing, do not attempt to change the test without asking first. You should try and solve the test failure by fixing the code, not by changing the test. If you truly believe there is a bug in the test, explain in detail what the bug is and why you believe it is a bug. Then, if I agree, you can change the test.
3. Abide by the best practice of Atomic Commits. Each commit should represent a single logical change to the codebase. If you find yourself making multiple changes in a single commit, consider breaking them up into smaller commits. This makes it much easier to review and understand the history of your changes.
4. This repository uses uv as the dependency manager as well as for managing the virtual environment. If you are running any code, you do so with `uv run <script>`. If you are adding dependencies, you do so with `uv add <package>`. However, for tools (e.g. ruff and ty), always do `uvx [tool] [command]` instead of `uv run [tool] [command]`.
5. The `tasks/` directory is meant to contain markdown files that describe tasks to be completed. When you are working on a task, you should create a new markdown file in the `tasks/` directory with a name that describes the task. The file should contain a description of the task, any relevant context, and any relevant links or references. You should also include a checklist of items to be completed for the task. Per the atomic commit rule, make sure you are only checking off one item per commit unless you ask permission first.
6. When fixing a bug, you must add a test to prevent regression. The bug is not considered fixed until a test exists that would have caught it.
