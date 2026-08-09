// utils/diff.ts - Word-level diff 工具

export interface DiffPart {
    type: 'add' | 'remove' | 'keep';
    text: string;
}

function tokenize(text: string): string[] {
    return text.split(/(\s+|[，。！？、；：""''（）【】《》-])/g).filter(Boolean);
}

export function wordDiff(oldText: string, newText: string): DiffPart[] {
    const oldTokens = tokenize(oldText);
    const newTokens = tokenize(newText);
    const result: DiffPart[] = [];
    let i = 0, j = 0;

    while (i < oldTokens.length || j < newTokens.length) {
        if (i < oldTokens.length && j < newTokens.length && oldTokens[i] === newTokens[j]) {
            result.push({ type: 'keep', text: oldTokens[i] });
            i++;
            j++;
        } else if (i < oldTokens.length && j < newTokens.length) {
            let found = false;
            for (let k = 1; k < 5 && i + k < oldTokens.length; k++) {
                if (j < newTokens.length && oldTokens[i + k] === newTokens[j]) {
                    for (let m = 0; m < k; m++) {
                        result.push({ type: 'remove', text: oldTokens[i + m] });
                    }
                    i += k;
                    found = true;
                    break;
                }
            }
            if (!found) {
                for (let k = 1; k < 5 && j + k < newTokens.length; k++) {
                    if (i < oldTokens.length && oldTokens[i] === newTokens[j + k]) {
                        for (let m = 0; m < k; m++) {
                            result.push({ type: 'add', text: newTokens[j + m] });
                        }
                        j += k;
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                if (i < oldTokens.length) {
                    result.push({ type: 'remove', text: oldTokens[i] });
                    i++;
                }
                if (j < newTokens.length) {
                    result.push({ type: 'add', text: newTokens[j] });
                    j++;
                }
            }
        } else if (i < oldTokens.length) {
            result.push({ type: 'remove', text: oldTokens[i] });
            i++;
        } else if (j < newTokens.length) {
            result.push({ type: 'add', text: newTokens[j] });
            j++;
        }
    }

    return result;
}

export function mergeDiffParts(parts: DiffPart[]): DiffPart[] {
    if (parts.length === 0) return [];
    const merged: DiffPart[] = [parts[0]];
    for (let i = 1; i < parts.length; i++) {
        const last = merged[merged.length - 1];
        if (last.type === parts[i].type) {
            last.text += parts[i].text;
        } else {
            merged.push({ ...parts[i] });
        }
    }
    return merged;
}

export function generateDiffHtml(diff: DiffPart[]): string {
    let html = '';
    for (const part of diff) {
        const escaped = part.text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        if (part.type === 'add') {
            html += `<span class="mb-diff-add">${escaped}</span>`;
        } else if (part.type === 'remove') {
            html += `<span class="mb-diff-remove">${escaped}</span>`;
        } else {
            html += `<span class="mb-diff-keep">${escaped}</span>`;
        }
    }
    return html;
}

export function generateDiffSummary(diff: DiffPart[]): string {
    let added = 0, removed = 0;
    for (const part of diff) {
        if (part.type === 'add') added += part.text.length;
        else if (part.type === 'remove') removed += part.text.length;
    }
    return `+${added} / -${removed}`;
}
