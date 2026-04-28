import React, { useState } from "react";
import styled from "styled-components";

// 전체 wrap: 안내 왼쪽 + 폼 오른쪽!
const MainWrap = styled.div`
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  gap: 38px;
  align-items: flex-start;
  justify-content: center;
  margin-top: 22px;
  @media (max-width: 850px) {
    flex-direction: column;
    gap: 24px;
  }
`;

// 안내 박스
const GuideBox = styled.div`
  min-width: 250px;
  max-width: 350px;
  background: #21232b;
  color: #bdd3f8;
  border-radius: 13px;
  box-shadow: 0 2px 16px 2px rgba(0,0,0,0.09);
  padding: 26px 23px 19px 23px;
  font-size: 15px;
  line-height: 2.05;
  @media (max-width: 850px) {
    max-width: 100%;
    padding: 18px 12px 15px 14px;
    font-size: 14px;
    margin-left: 0;
  }
`;

// 폼 박스
const FormBox = styled.div`
  min-width: 340px;
  max-width: 380px;
  background: #181818;
  color: #fff;
  border-radius: 11px;
  box-shadow: 0 2px 16px 2px rgba(0,0,0,0.15);
  border: 1px solid #23232e;
  padding: 32px 30px 24px 30px;
`;

// 입력 그룹
const SpecRow = styled.div`
  margin-bottom: 15px;
  display: flex;
  align-items: center;
  color: #fff;
  label {
    width: 108px;
    font-weight: bold;
    color: #ec2436;
    letter-spacing: 0.012em;
    font-size: 15px;
  }
  input {
    flex: 1;
    padding: 9px;
    border-radius: 5px;
    border: 1px solid #292940;
    background: #252734;
    color: #dbeaff;
    font-size: 15px;
    margin-left: 13px;
    outline: none;
  }
  input::placeholder {
    color: #535d7e;
    opacity: .85;
  }
`;

const ToggleButton = styled.button`
  background: #ed2323;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 12px 0;
  font-size: 16.5px;
  font-weight: 700;
  width: 100%;
  cursor: pointer;
  margin-bottom: 22px;
  margin-top: 5px;
  box-shadow: 0 1.5px 7px 0 rgba(217,26,26,0.09);
  transition: background .16s;
  &:hover { background: #b80000; }
`;

const SubmitButton = styled.button`
  background: #ed2323;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 11px 0;
  font-size: 16.5px;
  font-weight: 700;
  width: 100%;
  cursor: pointer;
  margin: 18px 0 5px 0;
  box-shadow: 0 1.5px 7px 0 rgba(217,26,26,0.09);
  transition: background .16s;
  &:hover { background: #b80000; }
`;

export default function MinSpecChecker() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState({
    os: "",
    cpu: "",
    ram: "",
    gpu: "",
    directx: "",
    storage: ""
  });
  const [result, setResult] = useState("");

  const min = {
    os: "Windows 10",
    ram: 8,
    directx: 11,
    storage: 85
  };

  function check() {
    // 그래픽/CPU : GB, 모델명, 아무거나 입력허용 + 간이 인식
    const gpuInput = user.gpu.trim().toLowerCase();
    let gpuOk = false;
    const gpuNumRes = gpuInput.match(/(\d+)\s*gb?/);
    if (gpuNumRes && Number(gpuNumRes[1]) >= 1) gpuOk = true;
    if (gpuInput.match(/gtx|rtx|nvidia|radeon|vega|intel|iris|arc/)) gpuOk = true;

    const ok =
      user.os.toLowerCase().includes("windows") &&
      parseInt(user.ram) >= min.ram &&
      gpuOk &&
      parseInt(user.directx) >= min.directx &&
      parseInt(user.storage) >= min.storage;

    setResult(ok ? "✅ 최소 사양을 충족합니다!" : "❌ 최소 사양 미달입니다.");
  }

  return (
    <div style={{marginTop:'10px', marginBottom: '5px'}}>
      <ToggleButton onClick={() => setOpen(o => !o)}>
        {open ? "입력 폼 닫기" : "플레이 가능 여부 확인하기"}
      </ToggleButton>
      {open && (
        <MainWrap>
          {/* 안내(GuideBox)가 먼저! */}
          <GuideBox>
  <b style={{color:"#ff354f", fontWeight:"bold", display:"block", marginBottom:"10px", fontSize:"16.0px"}}>❓ 사양을 어떻게 확인하나요?</b>
  <div style={{marginBottom:"9px"}}>
    <span style={{color:"#ffbe32"}}>윈도우 :</span>
    <b> 시작 → <span style={{color:"#b5d5ff"}}>'dxdiag'</span> 검색 → 실행</b><br/>
    <span style={{fontSize:"13px", color:"#bbb", marginTop:"2px"}}>(OS, CPU, 메모리, 그래픽카드, DirectX 모두 표시됨)</span>
    <br/><br/>
    <span style={{color:"#fae850"}}>또는 Ctrl + Shift + Esc → 작업 관리자 → 성능 탭에서 확인</span>
    <div style={{fontSize:"13px", color:"#bbb", marginTop:"2px"}}>(CPU, 메모리, 디스크, GPU 정보 등 실시간 표시)</div>
    <div style={{fontSize:"13px", color:"#bbb", marginTop:"2px"}}>(OS 확인방법 / 시작 → 설정 → 시스템 → 정보)</div>
  </div>
  <div style={{marginBottom:"11px"}}>
  </div>
  <div style={{color:'#8baaf7', fontWeight:"500", marginTop:"8px"}}>확인한 정보를 위 입력란에 넣고 비교해 보세요!</div>
</GuideBox>
          {/* 폼(FormBox)가 오른쪽! */}
          <FormBox>
            <form onSubmit={e => { e.preventDefault(); check(); }}>
              <SpecRow>
                <label>운영체제(OS)</label>
                <input value={user.os} onChange={e => setUser({ ...user, os: e.target.value })} placeholder="예: Windows 10" />
              </SpecRow>
              <SpecRow>
                <label>프로세서(CPU)</label>
                <input value={user.cpu} onChange={e => setUser({ ...user, cpu: e.target.value })} placeholder="예: i5 9400" />
              </SpecRow>
              <SpecRow>
                <label>메모리(GB)</label>
                <input value={user.ram} onChange={e => setUser({ ...user, ram: e.target.value })} type="number" placeholder="예: 16" />
              </SpecRow>
              <SpecRow>
                <label>그래픽</label>
                <input value={user.gpu} onChange={e => setUser({ ...user, gpu: e.target.value })} type="text" placeholder="예: RTX 3060, 4GB" />
              </SpecRow>
              <SpecRow>
                <label>DirectX</label>
                <input value={user.directx} onChange={e => setUser({ ...user, directx: e.target.value })} type="number" placeholder="예: 12" />
              </SpecRow>
              <SpecRow>
                <label>저장공간(GB)</label>
                <input value={user.storage} onChange={e => setUser({ ...user, storage: e.target.value })} type="number" placeholder="예: 200" />
              </SpecRow>
              <SubmitButton type="submit">최소사양과 비교하기</SubmitButton>
              {result && (
                <div style={{
                  color: result.includes("충족") ? "#5fff7d" : "#ff3b3b",
                  background: "#222c",
                  padding: "10px 0 0 0",
                  fontSize: "17px",
                  fontWeight: 700,
                  textAlign: "center"
                }}>
                  {result}
                </div>
              )}
            </form>
          </FormBox>
        </MainWrap>
      )}
    </div>
  );
}