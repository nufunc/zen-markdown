import mermaid from 'mermaid';

const code = `
flowchart TB
    KED["외부 한국평가데이터 시스템"]
    INET(("Internet"))
    VPNEQ["VPN장비 본사<br/>BLUEMAX NGF · SECUI"]

    subgraph SUB["KR-Caidentia Subscription · Korea Central"]
        subgraph HUB["Hub-VNet · 10.150.0.0/16"]
            HVPN["VPN Gateway<br/>Bastion · DBSafer · JumpBox"]
        end

        subgraph APPHUB["apphub-VNet · 10.158.0.0/16 · 신규"]
            subgraph PRD["PRD half · 10.158.0.0/17"]
                KPRD["K-LINK PRD 슬롯 · /20<br/>VM 10.158.19.0/24 · Docker 합본(앱+DB)"]
                OFPRD["OpenFire PRD 슬롯 · /20<br/>자리 예약"]
                EXPRD["예시 슬롯 ×6<br/>Jenkins·Nexus·SFTP·KIS·Notify·예비"]
                NATPRD["NAT GW PRD<br/>source IP 고정"]
            end
            subgraph STG["STG half · 10.158.128.0/17 · 대칭"]
                KSTG["K-LINK STG 슬롯 · /20<br/>VM 10.158.147.0/24"]
                OFSTG["OpenFire STG 슬롯 · /20 · 자리 예약"]
                EXSTG["예시 슬롯 ×6"]
                NATSTG["NAT GW STG"]
            end
        end

        subgraph SPOKES["소비처 Spoke ×5"]
            S1["Caidentia PRD · 10.151"]
            S2["Caidentia STG · 10.152"]
            S3["Admin PRD · 10.153"]
            S4["Admin STG · 10.154"]
            S5["Integration AKS · 10.156"]
        end
    end

    VPNEQ ==>|"S2S VPN (IPsec)"| HVPN
    APPHUB <===>|"peering · Gateway Transit 활성"| HUB
    SPOKES <===>|"peering ×5"| APPHUB
    SPOKES -.->|"내부 API → 10.158.19.x"| KPRD
    HVPN -.->|"운영자·연동 (Hub peering의 Gateway Transit 경유)"| KPRD
    KPRD ==>|"agent outbound only"| NATPRD
    NATPRD -->|"NAT 경유"| KED
    INET -.->|"직접 접근 차단"| KPRD
    PRD -. "PRD ↔ STG : NSG deny" .- STG

    classDef active fill:#E3F2FD,stroke:#0078D4,stroke-width:2px;
    classDef reserved fill:#F5F5F5,stroke:#999,stroke-dasharray:5 4,color:#666;
    classDef nat fill:#E3F2FD,stroke:#0078D4;
    classDef ext fill:#f8cecc,stroke:#b85450;
    classDef spoke fill:#ffffff,stroke:#6c8ebf;
    class KPRD,KSTG active;
    class OFPRD,OFSTG,EXPRD,EXSTG reserved;
    class NATPRD,NATSTG nat;
    class KED ext;
    class S1,S2,S3,S4,S5 spoke;
`;

async function test() {
  try {
    const valid = await mermaid.parse(code);
    console.log("VALID:", valid);
  } catch (e) {
    console.error("ERROR:", e);
  }
}

test();
