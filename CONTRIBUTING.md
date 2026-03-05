# Contributing to Pocket Kubrick

Thanks for your interest in contributing!

## Development Setup

1. Clone the repo and install dependencies:
    ```bash
    npm install
    ```

2. Set up your environment:
    ```bash
    cp .env.example .env
    # Edit .env with your API keys
    ```

3. Build and run:
    ```bash
    npm run build
    npm run dev -- <command>
    ```

## Running Tests

```bash
npm test
```

## Submitting Changes

1. Fork the repo and create a branch from `main`
2. Make your changes and add tests if applicable
3. Run `npm test` to verify nothing is broken
4. Submit a pull request with a clear description of the change

## Reporting Bugs

Open an issue at https://github.com/harmonicmean-ai/pocket-kubrick/issues with:
- Steps to reproduce
- Expected vs. actual behavior
- Node version and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
