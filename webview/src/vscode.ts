class VSCodeAPIWrapper {
    private readonly vsCodeApi: any;

    constructor() {
        if (typeof acquireVsCodeApi === 'function') {
            // acquireVsCodeApi는 두 번 호출하면 throw하므로, 모듈이 어떤 이유로든
            // 이중 평가되어도 안전하도록 인스턴스를 전역에 캐시해 재사용
            const g = globalThis as any;
            this.vsCodeApi = g.__vsCodeApiInstance ?? (g.__vsCodeApiInstance = acquireVsCodeApi());
        }
    }

    public postMessage(message: unknown) {
        if (this.vsCodeApi) {
            this.vsCodeApi.postMessage(message);
        } else {
            console.log('postMessage called without vscode API', message);
        }
    }

    // 웹뷰가 숨겨졌다 복원될 때(탭 전환) 유지되는 상태 — retainContextWhenHidden 없이 위치 보존용
    public getState(): any {
        return this.vsCodeApi?.getState?.();
    }

    public setState(state: any) {
        this.vsCodeApi?.setState?.(state);
    }

    public updateState(partial: Record<string, any>) {
        this.setState({ ...(this.getState() || {}), ...partial });
    }
}

export const vscode = new VSCodeAPIWrapper();
