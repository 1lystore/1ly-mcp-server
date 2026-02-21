# Contributing to 1ly MCP Server

Thank you for your interest in contributing to the 1ly MCP Server. This document outlines the process and expectations for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Community](#community)

## Code of Conduct

This project adheres to the Contributor Covenant [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to the team on [Discord](https://discord.gg/3pgAgQgpBn).

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/1ly-mcp-server.git
   cd 1ly-mcp-server
   ```
3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/1lystore/1ly-mcp-server.git
   ```

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- TypeScript knowledge
- Familiarity with MCP (Model Context Protocol)

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Environment Setup

See `README.md` for configuration details. If environment variables are required, set them using your preferred method (for example, a local `.env` file or shell exports).

## How to Contribute

### Reporting Bugs

**Before submitting a bug report:**
- Check the [existing issues](https://github.com/1lystore/1ly-mcp-server/issues) to avoid duplicates
- Collect relevant information (error messages, logs, steps to reproduce)

**Submit bugs using the bug report template:**
- Go to [Issues](https://github.com/1lystore/1ly-mcp-server/issues/new/choose)
- Select "Bug Report"
- Fill in all required sections

### Suggesting Features

To propose a new feature:

1. Check [existing feature requests](https://github.com/1lystore/1ly-mcp-server/issues?q=is%3Aissue+label%3Aenhancement)
2. Open a new issue using the "Feature Request" template
3. Describe the problem it solves and your proposed solution
4. Discuss in the issue or on [Discord](https://discord.gg/3pgAgQgpBn)

### Contributing Code

1. **Find or create an issue** describing what you plan to work on
2. **Comment on the issue** to let others know you're working on it
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```
4. **Make your changes** following our [coding standards](#coding-standards)
5. **Write tests** for new functionality
6. **Update documentation** if needed (README, JSDoc comments)
7. **Commit your changes** with clear, descriptive messages:
   ```bash
   git commit -m "feat: add support for XYZ"
   # or
   git commit -m "fix: resolve issue with ABC"
   ```
8. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
9. **Open a Pull Request** using our PR template

## Pull Request Process

### Before Submitting

- ✅ All tests pass (`npm test`)
- ✅ Code follows our style guide (`npm run lint`)
- ✅ TypeScript compiles without errors (`npm run build`)
- ✅ Changes are documented (README, JSDoc, CHANGELOG)
- ✅ Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/)

### PR Template

When you open a PR, fill out the template completely:

- **Description**: What does this PR do?
- **Related Issue**: Link to the issue it addresses
- **Type of Change**: Bug fix, feature, docs, etc.
- **Testing**: How did you test this?
- **Checklist**: Complete all items

### Review Process

1. Maintainers will review your PR as capacity allows
2. Address any requested changes
3. Once approved, a maintainer will merge your PR
4. Your contribution will be included in the next release

### After Your PR is Merged

- You will be added to the contributors list
- Consider joining our [Discord](https://discord.gg/3pgAgQgpBn) to stay connected

## Coding Standards

### TypeScript Style

- Use **TypeScript** for all new code
- Follow existing code style (enforced by ESLint)
- Use **explicit types** (avoid `any`)
- Document public APIs with **JSDoc comments**

### Code Structure

```typescript
/**
 * Brief description of what this function does
 * @param paramName - Description of parameter
 * @returns Description of return value
 */
export function functionName(paramName: Type): ReturnType {
  // Implementation
}
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new buyer tool for token info
fix: resolve payment confirmation issue
docs: update README with new examples
test: add unit tests for seller tools
chore: update dependencies
```

### Testing

- Write **unit tests** for new functionality
- Ensure **test coverage** doesn't decrease
- Run `npm test` before submitting PR

## Community

### Get Help

- **Discord**: Join our [Discord server](https://discord.gg/3pgAgQgpBn) for real-time help in `#devs`
- **GitHub Discussions**: Ask questions in [Discussions](https://github.com/1lystore/1ly-mcp-server/discussions)
- **Issues**: Search existing issues or open a new one

### Stay Updated

- **Watch** this repository for notifications
- Follow [@1lystore](https://twitter.com/1lystore) on Twitter/X
- Join our [Discord](https://discord.gg/3pgAgQgpBn) for announcements

## Recognition

Contributors are recognized in:
- The project README
- Release notes
- Our Discord server (with the `@Contributor` role)

## Bounties

We occasionally offer bounties for specific features or bug fixes. Check:
- [Discord #devs](https://discord.gg/3pgAgQgpBn) for active bounties
- GitHub issues labeled `bounty`

---

## Questions?

If you have questions about contributing, ask in:
- `#devs` on [Discord](https://discord.gg/3pgAgQgpBn)
- [GitHub Discussions](https://github.com/1lystore/1ly-mcp-server/discussions)

Thank you for contributing to 1ly.
