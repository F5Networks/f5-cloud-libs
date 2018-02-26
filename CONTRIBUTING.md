# Contributing

## Get the code
+ Fork the repository
+ Install dependencies
    ```
    npm install
    ```
+ Run the [unit tests](#unit-tests) to make sure everything is OK

## Style
Style is enforced with eslint. We use the airbnb style guide with some exceptions. There is no disputing the rationale - these are facts.
+ 4 spaces, not 2 ([indent](https://eslint.org/docs/rules/indent)). That's the way we are.
+ No dangling comma ([comma-dangle](https://eslint.org/docs/rules/comma-dangle)). Dangling commas are just ugly and if your code reviewer gets confused over this, perhaps you need a different reviewer.
+ Require braces around arrow functions ([arrow-body-style](https://eslint.org/docs/rules/arrow-body-style)). It looks better this way unless all your bodies are one line, and they never are. Also, it's less error prone if you have to add another line to the body.
+ No destructuring ([prefer-destructuring](https://eslint.org/docs/rules/prefer-destructuring)). The version of node on BIG-IP does not support it.

## Unit tests
+ To run unit tests
    ```
    npm test
    ```
+ Write unit tests for all new code
+ We recommend setting up the pre-commit git hook to run tests before committing
    ```
    cp gitHooks/pre-commit .git/hooks/pre-commit
    chmod 755 .git/hooks/pre-commit
    ```