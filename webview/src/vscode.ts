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

    // 웹뷰 상태. 탭 전환은 retainContextWhenHidden이 웹뷰를 살려 두므로 이 상태 없이도 유지되고, 창을 다시 열 때 스크롤 위치를 되살리는 데 쓴다
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
