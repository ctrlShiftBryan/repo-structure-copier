import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as tiktoken from 'tiktoken';
import ignore from 'ignore';

class RepoStructureCopier {
    private ig: ReturnType<typeof ignore> | null = null;

    async copyRepoStructure() {
        const rootPath = this.getRootPath();
        if (!rootPath) {
            return;
        }

        this.ig = await this.parseRepoIgnore(rootPath);
        const structure = await this.traverseDirectory(rootPath);
        const tokenCount = this.countTokens(structure);
        const formattedTokenCount = this.formatTokenCount(tokenCount);

        await vscode.env.clipboard.writeText(structure);
        vscode.window.showInformationMessage(`Repository structure copied to clipboard. Token count: ${formattedTokenCount}`);
    }

    private getRootPath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return null;
        }
        return workspaceFolders[0].uri.fsPath;
    }

    private async parseRepoIgnore(rootPath: string): Promise<ReturnType<typeof ignore>> {
        const ig = ignore();
        const repoIgnorePath = path.join(rootPath, '.repoignore');
        const gitignorePath = path.join(rootPath, '.gitignore');

        try {
            const repoIgnoreContent = await fs.readFile(repoIgnorePath, 'utf8');
            ig.add(repoIgnoreContent);
        } catch (error) {
            // If .repoignore doesn't exist, create it from .gitignore
            try {
                let gitignoreContent = await fs.readFile(gitignorePath, 'utf8');

                // Add '.git' to the ignore list if it's not already there
                if (!gitignoreContent.includes('.git')) {
                    gitignoreContent += '\n.git';
                }

                // Write the new .repoignore file
                await fs.writeFile(repoIgnorePath, gitignoreContent);

                ig.add(gitignoreContent);
                vscode.window.showInformationMessage('.repoignore file created from .gitignore');
            } catch (gitignoreError) {
                // If .gitignore also doesn't exist, create a basic .repoignore
                const basicIgnore = '.git\nnode_modules';
                await fs.writeFile(repoIgnorePath, basicIgnore);
                ig.add(basicIgnore);
                vscode.window.showInformationMessage('Basic .repoignore file created');
            }
        }

        return ig;
    }

    private shouldIgnore(filePath: string, rootPath: string): boolean {
        if (!this.ig) {
            return false;
        }

        const relativePath = path.relative(rootPath, filePath);
        return this.ig.ignores(relativePath);
    }

    private async traverseDirectory(dir: string, rootPath: string = dir): Promise<string> {
        let result = '<codebase>';
        const files = await fs.readdir(dir);

        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);

            if (this.shouldIgnore(filePath, rootPath)) {
                continue;
            }

            if (stat.isDirectory()) {
                result += await this.traverseDirectory(filePath, rootPath);
            } else {
                const content = await fs.readFile(filePath, 'utf8');
                result += `<file><path>${filePath}</path><content>${content}</content></file>`;
            }
        }

        result += '</codebase>';
        return result;
    }

    private countTokens(text: string): number {
        const encoding = tiktoken.encoding_for_model("gpt-4");
        const tokens = encoding.encode(text);
        encoding.free();
        return tokens.length;
    }

    private formatTokenCount(count: number): string {
        return count < 1000 ? count.toString() : `${(count / 1000).toFixed(1)}k`;
    }
}

export function activate(context: vscode.ExtensionContext) {
    const repoStructureCopier = new RepoStructureCopier();
    let disposable = vscode.commands.registerCommand('extension.copyRepoStructure', () => repoStructureCopier.copyRepoStructure());
    context.subscriptions.push(disposable);
}

export function deactivate() { }
