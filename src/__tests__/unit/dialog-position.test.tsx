import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

it('普通与指定高度的对话框均通过四边定位和自动外边距居中', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
        for (const className of ['', 'h-[90vh] flex flex-col']) {
            await act(async () => root.render(<Dialog open><DialogContent className={className}><DialogTitle>裁剪</DialogTitle><DialogDescription>框选题目</DialogDescription><button>确认</button></DialogContent></Dialog>));
            const classes = document.querySelector('[role="dialog"]')!.className.split(/\s+/);
            expect(classes).toContain('inset-0');
            expect(classes).toContain('m-auto');
            expect(classes.some(value => /^(translate-|left-\[50|top-\[50)/.test(value))).toBe(false);
            if (className) expect(classes).toContain('h-[90vh]');
        }
    } finally {
        await act(async () => root.unmount());
        host.remove();
        vi.unstubAllGlobals();
    }
});
