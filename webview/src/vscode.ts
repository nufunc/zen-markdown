class VSCodeAPIWrapper {
    private readonly vsCodeApi: any;

    constructor() {
        if (typeof acquireVsCodeApi === 'function') {
            this.vsCodeApi = acquireVsCodeApi();
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
