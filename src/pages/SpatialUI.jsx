import React, { useState, useRef, Suspense, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload, OrbitControls, Line, Html, Clone, useGLTF, Grid, Environment, Sparkles } from '@react-three/drei';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { useHandTracking, TRACKING_MODES } from '../utils/useHandTracking';
import ErrorBoundary from '../components/ErrorBoundary';

const PageContainer = styled.div`
  min-height: 100vh;
  width: 100%;
  background:
    radial-gradient(circle at 50% 42%, rgba(40, 80, 120, 0.32), transparent 42%),
    linear-gradient(180deg, #0a101c 0%, #05070d 100%);
  color: #f1f5f9;
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.1rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(20, 23, 30, 0.85);
  backdrop-filter: blur(16px);
  z-index: 10;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);

  .logo-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;

    .icon {
      font-size: 1.3rem;
    }

    h1 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #ffffff;
    }
  }

  .nav-back {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #cbd5e1;
    padding: 0.45rem 1rem;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.4);
      color: #ffffff;
    }
  }
`;

const MainContent = styled.main`
  flex: 1;
  position: relative;
  display: flex;
  z-index: 1;
  height: calc(100vh - 65px);

  @media (max-width: 968px) {
    flex-direction: column;
    overflow-y: auto;
    height: auto;
  }
`;

const Sidebar = styled.section`
  position: absolute;
  top: 1.5rem;
  bottom: 1.5rem;
  ${props => props.$left ? 'left: 1.5rem;' : 'right: 1.5rem;'}
  width: 290px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;

  ${props => props.$collapsed && (props.$left ? 'transform: translateX(-340px); opacity: 0; pointer-events: none;' : 'transform: translateX(340px); opacity: 0; pointer-events: none;')}

  @media (max-width: 968px) {
    position: relative;
    left: auto;
    right: auto;
    top: auto;
    bottom: auto;
    width: 100%;
    height: auto;
    margin-bottom: 1rem;
    ${props => props.$collapsed && 'display: none;'}
  }

  .btn-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  button.option {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #cbd5e1;
    border-radius: 6px;
    padding: 0.6rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(37, 99, 235, 0.08);
      border-color: rgba(37, 99, 235, 0.4);
      color: #fff;
    }

    &.active {
      background: #2563eb;
      border-color: #3b82f6;
      color: #fff;
    }
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;

    label {
      font-size: 0.7rem;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
    }

    input[type='range'] {
      -webkit-appearance: none;
      width: 100%;
      height: 4px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #3b82f6;
        cursor: pointer;
        transition: transform 0.1s;

        &:hover {
          transform: scale(1.2);
        }
      }
    }
  }

  .tech-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.68rem;
    color: #94a3b8;
    line-height: 1.45;
  }
`;

const CanvasContainer = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  left: ${props => props.$leftCollapsed ? '0' : '320px'};
  right: ${props => props.$rightCollapsed ? '0' : '320px'};
  transition: left 0.5s cubic-bezier(0.16, 1, 0.3, 1), right 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  z-index: 1;

  @media (max-width: 968px) {
    position: relative;
    left: 0 !important;
    right: 0 !important;
    height: 500px;
  }

  .pip-instructions {
    position: absolute;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 17, 23, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    padding: 0.6rem 1rem;
    font-size: 0.7rem;
    color: #e2e8f0;
    pointer-events: none;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    white-space: nowrap;
    z-index: 5;
  }
`;

const HudCard = styled.div`
  background: rgba(10, 16, 27, 0.72);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(80, 180, 255, 0.18);
  box-shadow: inset 0 0 18px rgba(80, 180, 255, 0.05), 0 18px 40px rgba(0, 0, 0, 0.38);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(0, 240, 255, 0.35), transparent);
    opacity: 0.7;
  }

  &:hover {
    border-color: rgba(80, 180, 255, 0.35);
    box-shadow: inset 0 0 24px rgba(80, 180, 255, 0.08), 0 20px 45px rgba(0, 0, 0, 0.45);
    &::before {
      background: linear-gradient(90deg, transparent, #00f0ff, transparent);
      opacity: 1;
    }
  }

  h3 {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #f1f5f9;
    border-left: 3px solid #2563eb;
    padding-left: 0.4rem;
    margin: 0;
    letter-spacing: 0.05em;
  }

  .tech-info {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.65rem;
    color: #94a3b8;
    line-height: 1.45;
  }

  /* Progress bar styles */
  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 0.2rem;
  }

  .progress-bar-fill {
    height: 100%;
    background: #2563eb;
    box-shadow: 0 0 8px #3b82f6;
  }

  /* Sparkline row style */
  .sparkline-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.62rem;
    font-family: 'JetBrains Mono', monospace;
    color: #94a3b8;
  }
`;

// Tag and Hotspot styled label
const TagLabel = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: ${props => props.$selected ? 'rgba(37, 99, 235, 0.92)' : 'rgba(10, 16, 27, 0.75)'};
  border: 1px solid ${props => props.$selected ? '#ffffff' : 'rgba(80, 180, 255, 0.35)'};
  border-radius: 4px;
  padding: 0.2rem 0.45rem;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.65rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  pointer-events: auto;
  transition: all 0.2s ease;
  user-select: none;
  box-shadow: ${props => props.$selected ? '0 0 15px rgba(37, 99, 235, 0.6), 0 4px 12px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.3)'};

  &:hover {
    background: rgba(37, 99, 235, 0.85);
    border-color: #fff;
    box-shadow: 0 0 10px rgba(0, 240, 255, 0.35);
  }

  .num {
    color: ${props => props.$selected ? '#fff' : '#00d2ff'};
    font-family: 'JetBrains Mono', monospace;
    font-weight: 800;
  }
`;

const EdgeTab = styled.button`
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  ${props => props.$left ? `left: ${props.$collapsed ? '0.5rem' : '305px'};` : `right: ${props.$collapsed ? '0.5rem' : '305px'};`}
  background: rgba(10, 16, 27, 0.85);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(80, 180, 255, 0.22);
  color: #00f0ff;
  font-family: 'Outfit', sans-serif;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 1.1rem 0.35rem;
  border-radius: 4px;
  writing-mode: vertical-lr;
  cursor: pointer;
  z-index: 10;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);

  &:hover {
    background: rgba(37, 99, 235, 0.18);
    border-color: #00f0ff;
  }

  @media (max-width: 968px) {
    display: none;
  }
`;

const DetailTooltip = styled.div`
  position: absolute;
  top: 100%;
  left: 50%;
  transform: ${props => props.$visible ? 'translate(-50%, 6px)' : 'translate(-50%, 16px)'};
  background: rgba(10, 16, 27, 0.92);
  border: 1px solid rgba(80, 180, 255, 0.4);
  box-shadow: 0 8px 24px rgba(0, 240, 255, 0.2), inset 0 0 10px rgba(80, 180, 255, 0.15);
  border-radius: 6px;
  padding: 0.5rem;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  width: 190px;
  white-space: normal;
  pointer-events: none;
  z-index: 100;
  backdrop-filter: blur(10px);
  opacity: ${props => props.$visible ? 1 : 0};
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  .tooltip-title {
    font-size: 0.65rem;
    font-weight: 700;
    color: #00f0ff;
    margin-bottom: 0.25rem;
    display: flex;
    justify-content: space-between;
    font-family: 'JetBrains Mono', monospace;
  }
  .tooltip-desc {
    font-size: 0.62rem;
    color: #cbd5e1;
    line-height: 1.4;
  }
`;

// Refrigerator parts metadata
const FRIDGE_PARTS = {
  '01': {
    id: 'RF-FC-001',
    name: '冷藏保鲜层',
    title: '01 冷藏保鲜层',
    desc: '双路微冷循环风道技术，智能控温保鲜，温度区间：2℃至8℃。',
    specs: {
      material: '食品级 ABS / 钢化玻璃',
      weight: '18.5 kg',
      status: '正常',
      temp: '4.0 ℃',
      vibration: '0.1 mm/s',
      power: '---',
      efficiency: '92.0%'
    },
    pos: [0, 0.65, 0.35]
  },
  '02': {
    id: 'RF-FZ-002',
    name: '极速冷冻层',
    title: '02 极速冷冻层',
    desc: '超导一体风冷无霜蒸发器，最低制冷温度可达 -24℃。',
    specs: {
      material: '发泡聚氨酯 / 铝板',
      weight: '24.2 kg',
      status: '活动',
      temp: '-18.0 ℃',
      vibration: '0.2 mm/s',
      power: '---',
      efficiency: '95.0%'
    },
    pos: [0, -0.45, 0.35]
  },
  '03': {
    id: 'RF-CP-003',
    name: '变频压缩机',
    title: '03 变频压缩机',
    desc: '双转子直流变频静音压缩机，能耗比极佳，全天候噪音低于32dB。',
    specs: {
      material: '铸钢 / 铜绕组',
      weight: '12.0 kg',
      status: '正常',
      temp: '45.2 ℃',
      vibration: '0.8 mm/s',
      power: '120 W',
      efficiency: '96.5%'
    },
    pos: [0, -0.85, -0.45]
  },
  '04': {
    id: 'RF-SP-004',
    name: '智能控制板',
    title: '04 智能控制板',
    desc: '透光晶体玻璃晶格触屏，集成智能物联控制芯片。',
    specs: {
      material: '微处理器 / LCD 面板',
      weight: '0.85 kg',
      status: '在线',
      temp: '28.1 ℃',
      vibration: '0.0 mm/s',
      power: '12 W',
      efficiency: '98.0%'
    },
    pos: [0.55, 0.4, 0.45]
  },
  '05': {
    id: 'RF-FN-005',
    name: '双循环风扇',
    title: '05 双循环风扇',
    desc: '冷藏与冷冻舱独立无刷直流空气循环风扇，提供高效强制冷气对流。',
    specs: {
      material: '强化工程塑料',
      weight: '0.45 kg',
      status: '正常',
      temp: '-2.0 ℃',
      vibration: '0.1 mm/s',
      power: '8 W',
      efficiency: '94.0%'
    },
    pos: [0, 0.85, 0.2]
  },
  '06': {
    id: 'RF-MT-006',
    name: '宽频变温舱',
    title: '06 宽频变温舱',
    desc: '支持 -20℃ 至 5℃ 宽幅温度精准调节的独立抽屉，满足不同食材保鲜需求。',
    specs: {
      material: '食品级高透 PP',
      weight: '4.2 kg',
      status: '正常',
      temp: '0.0 ℃',
      vibration: '---',
      power: '---',
      efficiency: '95.0%'
    },
    pos: [0, 0.15, 0.35]
  },
  '07': {
    id: 'RF-DD-007',
    name: '除菌净味模块',
    title: '07 除菌净味模块',
    desc: '主动式高浓度负氧离子群除菌系统，强力祛除异味并有效降解农残。',
    specs: {
      material: '纳米触媒催化剂',
      weight: '0.3 kg',
      status: '在线',
      temp: '8.0 ℃',
      vibration: '---',
      power: '4 W',
      efficiency: '99.0%'
    },
    pos: [0.35, 0.55, 0.1]
  },
  '08': {
    id: 'RF-CD-008',
    name: '冷凝器排热板',
    title: '08 冷凝器排热板',
    desc: '隐藏式金属背板冷凝热交换器，将压缩机排出的高压热量均匀散发。',
    specs: {
      material: '高导热铝制板管',
      weight: '8.5 kg',
      status: '运行',
      temp: '38.2 ℃',
      vibration: '0.2 mm/s',
      power: '---',
      efficiency: '93.5%'
    },
    pos: [0, 0, -0.38]
  }
};

// Battery parts metadata
const BATTERY_PARTS = {
  '01': {
    id: 'BT-AT-001',
    name: '正极端子',
    title: '01 正极汇流端子',
    desc: '阳极集流体采用高导电防氧化铜合金镀金，接触内阻极低。',
    specs: {
      material: '铜合金镀金',
      weight: '0.12 kg',
      status: '正常',
      temp: '32.5 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.8%'
    },
    pos: [0, 1.15, 0]
  },
  '02': {
    id: 'BT-CT-002',
    name: '负极端子',
    title: '02 负极连接端子',
    desc: '阴极集流体外层使用高纯度镍片复合冲压压铸而成，散热性极佳。',
    specs: {
      material: '高纯度复合镍板',
      weight: '0.15 kg',
      status: '正常',
      temp: '31.8 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.6%'
    },
    pos: [0, -1.15, 0]
  },
  '03': {
    id: 'BT-MS-003',
    name: '纳米多孔隔膜',
    title: '03 纳米多孔隔膜',
    desc: '12μm 多孔聚乙烯安全隔离层，熔融自闭安全防护温度达130℃。',
    specs: {
      material: '多孔聚乙烯安全膜',
      weight: '0.05 kg',
      status: '绝缘',
      temp: '29.5 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '99.9%'
    },
    pos: [0, 0, 0.15]
  },
  '04': {
    id: 'BT-SE-004',
    name: '固态电解质',
    title: '04 固态电解质',
    desc: '新型固态锂聚合物电解质凝胶，大幅抑制锂枝晶生长，消除漏液风险。',
    specs: {
      material: '锂聚合物凝胶',
      weight: '1.45 kg',
      status: '正常',
      temp: '34.2 ℃',
      vibration: '0.0 mm/s',
      power: '---',
      efficiency: '97.2%'
    },
    pos: [0.35, 0, -0.2]
  },
  '05': {
    id: 'BT-IC-005',
    name: '绝缘防爆壳',
    title: '05 绝缘防爆密封壳',
    desc: '高强度复合树脂防爆外壳，提供高级电气绝缘、抗机械挤压及防水防尘。',
    specs: {
      material: '高强度阻燃 ABS/PC',
      weight: '3.5 kg',
      status: '正常',
      temp: '25.5 ℃',
      vibration: '---',
      power: '---',
      efficiency: '99.9%'
    },
    pos: [0.45, 0, 0.25]
  },
  '06': {
    id: 'BT-TH-006',
    name: '测温线束',
    title: '06 温度检测线束',
    desc: '高集成式多点 NTC 热敏电阻传感器排线，精确捕获内部电芯温度异动。',
    specs: {
      material: '镀锡扁平铜线 / FEP',
      weight: '0.18 kg',
      status: '在线',
      temp: '30.2 ℃',
      vibration: '---',
      power: '---',
      efficiency: '99.5%'
    },
    pos: [0, 0.6, 0.15]
  },
  '07': {
    id: 'BT-PR-007',
    name: '泄压爆破阀',
    title: '07 泄压爆破安全阀',
    desc: '高灵敏度单向机械爆破片，在电芯内压异常升高时主动开启定向排气泄压。',
    specs: {
      material: '防爆铝合金薄膜',
      weight: '0.02 kg',
      status: '正常',
      temp: '28.0 ℃',
      vibration: '---',
      power: '---',
      efficiency: '100%'
    },
    pos: [0, 1.1, 0.3]
  },
  '08': {
    id: 'BT-BM-008',
    name: 'BMS控制器',
    title: '08 电池管理系统 (BMS)',
    desc: '搭载专有SOC估算算法，监控单体过充过放，并控制主动式电荷均衡。',
    specs: {
      material: '双核 MCU 核心板',
      weight: '0.15 kg',
      status: '在线',
      temp: '35.4 ℃',
      vibration: '---',
      power: '5 W',
      efficiency: '98.5%'
    },
    pos: [0.2, 1.05, 0.1]
  }
};

// Turbine parts metadata
const TURBINE_PARTS = {
  '01': {
    id: 'WT-FR-001',
    name: '桨叶转子',
    title: '01 桨叶转子',
    desc: '高刚性碳纤维结构叶片，捕捉微弱风能并转化为转矩机械能。',
    specs: {
      material: '碳纤维复合材料',
      weight: '8.45 吨',
      status: '正常',
      temp: '32.1 ℃',
      vibration: '1.2 mm/s',
      power: '---',
      efficiency: '94.5%'
    },
    pos: [0, 1.25, 0.83]
  },
  '02': {
    id: 'WT-BH-002',
    name: '主轴承座箱',
    title: '02 主轴承座箱',
    desc: '重载调心滚子轴承座，承受风力发电机偏航与俯仰弯矩扭矩载荷。',
    specs: {
      material: '高韧性球墨铸铁 QT400',
      weight: '9.35 吨',
      status: '正常',
      temp: '45.8 ℃',
      vibration: '1.5 mm/s',
      power: '---',
      efficiency: '99.1%'
    },
    pos: [0, 1.17, -0.6]
  },
  '03': {
    id: 'WT-CS-003',
    name: '主轴系统',
    title: '03 主轴系统',
    desc: '高强度锻钢主轴，支承风轮气动力与交变载荷并传递扭矩。',
    specs: {
      material: '合金锻钢 34CrNiMo6',
      weight: '12.80 吨',
      status: '正常',
      temp: '41.2 ℃',
      vibration: '1.8 mm/s',
      power: '---',
      efficiency: '98.5%'
    },
    pos: [0, 1.17, 0.15]
  },
  '04': {
    id: 'WT-GS-004',
    name: '行星齿轮级',
    title: '04 行星齿轮级',
    desc: '两级行星齿轮及一级平行齿轮增速机构，将低速轴增速至额定发电转速。',
    specs: {
      material: '合金渗碳钢 18CrNiMo7-6',
      weight: '15.20 吨',
      status: '正常',
      temp: '54.5 ℃',
      vibration: '2.4 mm/s',
      power: '---',
      efficiency: '97.8%'
    },
    pos: [0, 1.29, 0.38]
  },
  '05': {
    id: 'WT-PM-005',
    name: '发电机模块',
    title: '05 发电机模块',
    desc: '全功率变流集成柜与双馈发电机，实现网侧与电机侧双向变流与电能调制。',
    specs: {
      material: 'IGBT 晶闸管阵列',
      weight: '3.10 吨',
      status: '在线',
      temp: '42.3 ℃',
      vibration: '0.8 mm/s',
      power: '3.2 MW',
      efficiency: '96.8%'
    },
    pos: [0, 1.25, -0.2]
  },
  '06': {
    id: 'WT-YR-006',
    name: '偏航回转齿圈',
    title: '06 偏航回转齿圈',
    desc: '大型内啮合重载回转支承大齿齿轮圈，承载整个机舱的偏航负载与剪切力。',
    specs: {
      material: '碳素铸钢 ZG310-570',
      weight: '4.50 吨',
      status: '正常',
      temp: '28.5 ℃',
      vibration: '0.4 mm/s',
      power: '---',
      efficiency: '98.0%'
    },
    pos: [0, 0.45, -0.45]
  }
};

// 3D Tag and Hotspot Node Component (renders inside R3F)
function TagNode({ partId, name, position, isSelected, isHovered, onSelect, onHover, explode, desc, partCode }) {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += 0.012;
      const pulse = 1.0 + Math.sin(state.clock.elapsedTime * 3.5) * 0.08;
      meshRef.current.scale.setScalar(isSelected ? 1.3 : pulse);
    }
  });

  const labelOffset = [0.2, 0.18, 0];

  // Fade out tags when model is fully closed to prevent clustered overlapping
  const tagOpacity = isSelected ? 1.0 : Math.max(0.05, Math.min(0.85, (explode - 0.06) * 5.5));

  return (
    <group position={position}>
      {/* Visual Hotspot sphere */}
      <mesh>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={isSelected ? '#ffffff' : '#3b82f6'} transparent opacity={tagOpacity} />
      </mesh>

      {/* Large Invisible Hit Target Sphere (low-poly proxy collider for easy hover & click) */}
      <mesh
        onClick={tagOpacity >= 0.15 ? (e) => {
          e.stopPropagation();
          onSelect();
        } : undefined}
        onPointerOver={tagOpacity >= 0.15 ? (e) => {
          e.stopPropagation();
          onHover(partId);
        } : undefined}
        onPointerOut={tagOpacity >= 0.15 ? (e) => {
          e.stopPropagation();
          onHover(null);
        } : undefined}
      >
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Pulsing wireframe circle */}
      <mesh ref={meshRef}>
        <ringGeometry args={[0.065, 0.085, 16]} />
        <meshBasicMaterial
          color={isSelected ? '#ffffff' : '#3b82f6'}
          side={THREE.DoubleSide}
          transparent
          opacity={tagOpacity * 0.7}
        />
      </mesh>

      {/* Floating Leader Line */}
      {isSelected && (
        <Line
          points={[[0, 0, 0], labelOffset]}
          color="#3b82f6"
          lineWidth={1.2}
          transparent
          opacity={0.5}
        />
      )}

      {/* Floating 3D Label Tag */}
      <Html position={labelOffset} center distanceFactor={6.2}>
        <div 
          onPointerOver={(e) => {
            e.stopPropagation();
            onHover(partId);
          }}
          onPointerOut={() => {
            onHover(null);
          }}
          style={{ position: 'relative' }}
        >
          <TagLabel 
            $selected={isSelected} 
            onClick={onSelect}
            style={{ opacity: tagOpacity, pointerEvents: tagOpacity < 0.15 ? 'none' : 'auto' }}
          >
            <span className="num">{partId}</span>
            <span className="name">{name}</span>
          </TagLabel>
          
          <DetailTooltip $visible={isHovered && tagOpacity >= 0.15}>
            <div className="tooltip-title">
              <span>{partCode}</span>
              <span style={{ color: '#ffffff', opacity: 0.6 }}>全息说明</span>
            </div>
            <div className="tooltip-desc">{desc}</div>
          </DetailTooltip>
        </div>
      </Html>
    </group>
  );
}

// Procedural Refrigerator Model
function Refrigerator({ explode }) {
  const ref = useRef();
  
  // Exploded translations mapping
  const doorRotateY = explode * (Math.PI * 0.65); // Open doors up to 120deg
  const drawerZ = explode * 0.72; // Slide drawers forward
  const shelfZ = explode * 0.42; // Slide shelf forward
  const backPanelY = -explode * 0.35; // Back panels push back/down

  return (
    <group ref={ref}>
      {/* 1. Main Cabinet Shell (Translucent holographic structure) */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 2.0, 0.8]} />
        <meshPhysicalMaterial
          color="#0f1f2e"
          roughness={0.12}
          metalness={0.1}
          transmission={0.4}
          ior={1.2}
          thickness={0.2}
          transparent
          opacity={0.36}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Wireframe border outlining the cabinet shell */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1.0, 2.0, 0.8]} />
        <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.18} />
      </mesh>

      {/* 2. Divider Panel (Center Shelf) */}
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.96, 0.03, 0.72]} />
        <meshBasicMaterial color="#00f0ff" transparent opacity={0.25} />
      </mesh>

      {/* 3. Sliding Upper Food Shelf */}
      <group position={[0, 0.5, shelfZ]}>
        <mesh>
          <boxGeometry args={[0.92, 0.02, 0.68]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} transparent opacity={0.4} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.92, 0.02, 0.68]} />
          <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.12} />
        </mesh>
      </group>

      {/* 4. Sliding Freezer Drawer */}
      <group position={[0, -0.45, drawerZ]}>
        <mesh>
          <boxGeometry args={[0.88, 0.35, 0.65]} />
          <meshPhysicalMaterial color="#00ff88" transmission={0.8} transparent opacity={0.12} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.88, 0.35, 0.65]} />
          <meshBasicMaterial color="#00ff88" wireframe transparent opacity={0.15} />
        </mesh>
      </group>

      {/* 5. Rotary Doors (Upper Door hinges on the right, Lower Door on left) */}
      <group position={[0.5, 0.55, 0.4]}>
        <group rotation={[0, -doorRotateY, 0]} position={[-0.5, 0, 0]}>
          <mesh position={[0.5, 0, 0.02]}>
            <boxGeometry args={[0.96, 0.9, 0.05]} />
            <meshPhysicalMaterial color="#00e5ff" transmission={0.65} transparent opacity={0.25} />
          </mesh>
          <mesh position={[0.5, 0, 0.02]}>
            <boxGeometry args={[0.96, 0.9, 0.05]} />
            <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.15} />
          </mesh>
        </group>
      </group>

      {/* 6. Compressor (Cylinder component at the back bottom) */}
      <group position={[0, -0.85, backPanelY - 0.28]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.32, 16]} />
          <meshBasicMaterial color="#ffa801" transparent opacity={0.4} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.18, 0.18, 0.32, 16]} />
          <meshBasicMaterial color="#ffa801" wireframe transparent opacity={0.2} />
        </mesh>
      </group>
    </group>
  );
}

// Procedural Battery Model
function Battery({ explode }) {
  const ref = useRef();

  // Exploded translations mapping
  const caseX = explode * 0.76;       // Shell splits in half along X-axis
  const cathodeY = -explode * 0.5;   // Cathode shifts down
  const anodeY = explode * 0.5;       // Anode shifts up
  const coreZ = explode * 0.4;        // Internal layers separate slightly along Z

  return (
    <group ref={ref}>
      {/* 1. Translucent Outer Casing (Left Half) */}
      <group position={[-caseX, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, 0, Math.PI]} />
          <meshPhysicalMaterial
            color="#00f0ff"
            roughness={0.08}
            transmission={0.8}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, 0, Math.PI]} />
          <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Translucent Outer Casing (Right Half) */}
      <group position={[caseX, 0, 0]}>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, Math.PI, Math.PI]} />
          <meshPhysicalMaterial
            color="#00f0ff"
            roughness={0.08}
            transmission={0.8}
            transparent
            opacity={0.25}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1.8, 16, 2, true, Math.PI, Math.PI]} />
          <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.15} side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* 2. Active Cathode Terminal (-) */}
      <group position={[0, cathodeY - 0.96, 0]}>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.12, 16]} />
          <meshBasicMaterial color="#0072ff" transparent opacity={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.26, 0.26, 0.12, 16]} />
          <meshBasicMaterial color="#0072ff" wireframe transparent opacity={0.2} />
        </mesh>
      </group>

      {/* 3. Active Anode Terminal (+) */}
      <group position={[0, anodeY + 0.96, 0]}>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.5} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.18, 0.18, 0.12, 16]} />
          <meshBasicMaterial color="#ef4444" wireframe transparent opacity={0.2} />
        </mesh>
      </group>

      {/* 4. Internal Separator Matrix Layer */}
      <group position={[0, 0, coreZ]}>
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.5, 16]} />
          <meshPhysicalMaterial color="#ffffff" transmission={0.9} transparent opacity={0.22} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.42, 0.42, 1.5, 16]} />
          <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.12} />
        </mesh>
      </group>

      {/* 5. Electrolyte Colloidal Matrix */}
      <group position={[0, 0, -coreZ]}>
        <mesh>
          <cylinderGeometry args={[0.35, 0.35, 1.35, 12]} />
          <meshBasicMaterial color="#00ff88" transparent opacity={0.18} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[0.35, 0.35, 1.35, 12]} />
          <meshBasicMaterial color="#00ff88" wireframe transparent opacity={0.1} />
        </mesh>
      </group>
    </group>
  );
}

// Helper to map Turbine part IDs to their initial local coordinates in the GLB
const getTurbinePartLocalPos = (id) => {
  switch (id) {
    case '01': return [0, 1.25, 0.83];     // Blades
    case '02': return [0, 1.17, -0.6];     // Main bearing seat box
    case '03': return [0, 1.17, 0.15];     // Shaft system
    case '04': return [0, 1.29, 0.38];     // Gearbox
    case '05': return [0, 1.25, -0.2];     // Generator
    case '06': return [0, 0.45, -0.45];    // Yaw gear ring
    default: return [0, 0, 0];
  }
};

// Procedural high-fidelity Wind Turbine Model loaded from GLB
function Turbine({ explode, turbineRef, configMode, selectedMeshIdx, hoveredMeshIdx }) {
  const { scene } = useGLTF("/model/glb/turbine.glb");

  useFrame((state, delta) => {
    if (!turbineRef.current) return;
    
    // Rotate the blades when not exploded or slowly when exploded
    const blades = turbineRef.current.getObjectByName("defaultMaterial_45");
    if (blades) {
      blades.rotateY(delta * (1.2 * (1 - explode * 0.85))); // Rotates slower as it explodes
    }

    // Apply real-time explode translation along Z axis
    const children = turbineRef.current.children;
    if (children && children.length > 0) {
      const length = children.length;
      const mid = (length - 1) / 2;
      const step = 0.15;

      children.forEach((child, index) => {
        if (child.isMesh) {
          if (!child.userData.originPosition) {
            child.userData.originPosition = child.position.clone();
          }
          const originPos = child.userData.originPosition;
          const offset = (index - mid) * step * explode;
          child.position.z = originPos.z + offset;
        }
      });
    }
  });

  // Dynamically swap materials for configuration mode highlights
  useEffect(() => {
    if (!turbineRef.current) return;
    const children = turbineRef.current.children;
    if (!children) return;

    children.forEach((child, index) => {
      if (child.isMesh) {
        if (!child.userData.originalMaterial) {
          child.userData.originalMaterial = child.material;
        }

        if (configMode) {
          if (index === selectedMeshIdx) {
            // Selected mesh: bright solid gold
            child.material = new THREE.MeshStandardMaterial({
              color: '#f59e0b',
              emissive: '#b45309',
              roughness: 0.1,
              metalness: 0.8
            });
          } else if (index === hoveredMeshIdx) {
            // Hovered mesh: cyan
            child.material = new THREE.MeshStandardMaterial({
              color: '#06b6d4',
              emissive: '#0891b2',
              roughness: 0.2,
              metalness: 0.5
            });
          } else {
            // Semi-transparent other meshes
            child.material = new THREE.MeshPhysicalMaterial({
              color: '#475569',
              transparent: true,
              opacity: 0.18,
              depthWrite: false
            });
          }
        } else {
          // Restore original material
          child.material = child.userData.originalMaterial;
        }
      }
    });
  }, [configMode, selectedMeshIdx, hoveredMeshIdx, turbineRef, scene]);

  return (
    <group scale={1.2} position={[0, -0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
      <Clone
        deep
        castShadow
        receiveShadow
        ref={turbineRef}
        object={scene}
      />
    </group>
  );
}

// Scene controller that binds models, rotation physics, and hotspots
function SpatialScene({
  activeModel,
  explode,
  setExplode,
  selectedPartId,
  setSelectedPartId,
  fov,
  autoRotate,
  cameraPreset,
  setCameraPreset,
  focusMode,
  hoveredPartId,
  setHoveredPartId,
  configMode,
  selectedMeshIdx,
  setSelectedMeshIdx,
  hoveredMeshIdx,
  setHoveredMeshIdx,
  customTurbineParts,
  setCustomTurbineParts,
  partMeshIndices,
  setPartMeshIndices,
  onModelLoaded
}) {
  const groupRef = useRef();
  const tickRingRef = useRef();
  const turbineRef = useRef();
  const isPinchingRef = useRef(false);
  const prevCursorRef = useRef({ x: 0, y: 0 });

  const mappingCalculated = useRef(false);

  useEffect(() => {
    mappingCalculated.current = false;
    setPartMeshIndices({});
  }, [activeModel, setPartMeshIndices]);

  const { cursor, handDetected, trackingMode, isPinching } = useHandTracking();

  useFrame((state, delta) => {
    const { camera, controls } = state;
    const group = groupRef.current;
    if (!group) return;

    // Dynamically calculate the mapping from turbine parts to closest child meshes on load
    if (activeModel === 'turbine' && turbineRef.current && !mappingCalculated.current) {
      const children = turbineRef.current.children;
      if (children && children.length > 0) {
        const mapping = {};
        Object.entries(customTurbineParts).forEach(([id, item]) => {
          let closestChildIndex = -1;
          let minDistance = Infinity;
          const [lx, ly, lz] = getTurbinePartLocalPos(id);
          const targetPos = new THREE.Vector3(lx, ly, lz);

          children.forEach((child, index) => {
            if (child.isMesh) {
              if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
              }
              const center = new THREE.Vector3();
              child.geometry.boundingBox.getCenter(center);
              center.applyMatrix4(child.matrix);
              
              const dist = center.distanceTo(targetPos);
              if (dist < minDistance) {
                minDistance = dist;
                closestChildIndex = index;
              }
            }
          });
          mapping[id] = closestChildIndex;
        });
        setPartMeshIndices(mapping);
        mappingCalculated.current = true;

        // Populate mesh list for configuration panel
        const list = children.map((c, i) => ({
          index: i,
          name: c.name,
          isMesh: c.isMesh
        }));
        setTimeout(() => {
          if (onModelLoaded) {
            onModelLoaded(list);
          }
        }, 0);
      }
    }

    // Direct R3F raycaster pointer to the hand cursor coordinate if hand tracking is active
    if (trackingMode !== 'mouse' && handDetected) {
      state.pointer.set(cursor.x, cursor.y);
      
      // Control 3D group rotation via air hand movement ONLY when pinching (pinch-to-rotate)
      // We ignore pinch starts below cursor.y = -0.55 to prevent conflicts when dragging the bottom slider/controls
      if (isPinching) {
        if (!isPinchingRef.current) {
          if (cursor.y > -0.55) {
            isPinchingRef.current = true;
            prevCursorRef.current = { x: cursor.x, y: cursor.y };
          }
        } else {
          const dx = cursor.x - prevCursorRef.current.x;
          const dy = cursor.y - prevCursorRef.current.y;
          
          group.rotation.y += dx * 2.8;
          group.rotation.x = Math.max(-0.65, Math.min(0.65, group.rotation.x + dy * 2.0));
          
          prevCursorRef.current = { x: cursor.x, y: cursor.y };
        }
      } else {
        isPinchingRef.current = false;
      }
    } else if (autoRotate) {
      group.rotation.y += delta * 0.15;
    }

    // Smoothly LERP camera fov for lens zoom effect
    const targetFov = focusMode ? 30 : fov;
    if (camera.fov !== targetFov) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 0.15);
      camera.updateProjectionMatrix();
    }

    // Smoothly animate camera to presets
    if (cameraPreset) {
      const targetPos = new THREE.Vector3(0, 0, 4.8);
      switch (cameraPreset) {
        case 'home':
          targetPos.set(0, 0, 4.8);
          break;
        case 'front':
          targetPos.set(0, 0, 4.8);
          break;
        case 'side':
          targetPos.set(4.8, 0, 0.01);
          break;
        case 'top':
          targetPos.set(0, 4.8, 0.01);
          break;
        case 'iso':
          targetPos.set(3.2, 2.5, 3.2);
          break;
        default:
          break;
      }

      camera.position.lerp(targetPos, 0.1);
      
      if (controls) {
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.1);
        controls.update();
      }

      if (camera.position.distanceTo(targetPos) < 0.02) {
        setCameraPreset(null);
      }
    }

    // Rotate tick ring
    if (tickRingRef.current) {
      tickRingRef.current.rotation.z -= delta * 0.15;
    }
  });

  // Handle hand pinch gesture to select the currently hovered 3D sub-component
  useEffect(() => {
    if (trackingMode !== 'mouse' && handDetected && isPinching) {
      if (hoveredPartId) {
        setSelectedPartId(hoveredPartId);
      }
    }
  }, [isPinching, hoveredPartId, handDetected, trackingMode, setSelectedPartId]);

  const partsData = activeModel === 'fridge' 
    ? FRIDGE_PARTS 
    : (activeModel === 'battery' ? BATTERY_PARTS : customTurbineParts);

  const getExplodedPosition = useCallback((id, pos) => {
    const [x, y, z] = pos;
    if (activeModel === 'turbine') {
      let localX = 0;
      let localY = 0;
      let localZ = 0;
      
      switch (id) {
        case '01': // Blades
          localX = 0; localY = 1.25; localZ = 0.83;
          break;
        case '02': // Main Bearing Box
          localX = 0; localY = 1.17; localZ = -0.6;
          break;
        case '03': // Core Shaft
          localX = 0; localY = 1.17; localZ = 0.15;
          break;
        case '04': // Gearbox
          localX = 0; localY = 1.29; localZ = 0.38;
          break;
        case '05': // Generator
          localX = 0; localY = 1.25; localZ = -0.2;
          break;
        case '06': // Yaw Gear Ring
          localX = 0; localY = 0.45; localZ = -0.45;
          break;
        default:
          return pos;
      }
      
      // Calculate local Z explode displacement
      const zOffset = localZ * explode * 0.85;
      const explodedLocalZ = localZ + zOffset;
      
      // Project local GLB coordinates to rotated parent space:
      // Rotated by PI/2 around Y: [localX, localY, localZ] -> [localZ, localY, -localX]
      // Scaled by 1.2, and shifted by -0.6 along the Y-axis.
      const globalX = explodedLocalZ * 1.2;
      const globalY = localY * 1.2 - 0.6;
      const globalZ = -localX * 1.2;
      
      return [globalX, globalY, globalZ];
    }
    
    if (activeModel === 'battery') {
      if (id === '01') return [x, y + explode * 0.5, z];
      if (id === '02') return [x, y - explode * 0.5, z];
      if (id === '03') return [x, y, z + explode * 0.4];
      if (id === '04') return [x, y, z - explode * 0.4];
      if (id === '05') return [x + explode * 0.45, y, z];
      if (id === '06') return [x, y + explode * 0.25, z + explode * 0.15];
      if (id === '07') return [x, y + explode * 0.35, z + explode * 0.3];
      if (id === '08') return [x + explode * 0.2, y + explode * 0.35, z + explode * 0.1];
    }
    
    if (activeModel === 'fridge') {
      if (id === '01') return [x, y, z + explode * 0.42];
      if (id === '02') return [x, y, z + explode * 0.72];
      if (id === '03') return [x, y - explode * 0.35, z - explode * 0.28];
      if (id === '04') return [x - explode * 0.35, y, z + explode * 0.45];
      if (id === '05') return [x, y + explode * 0.3, z + explode * 0.2];
      if (id === '06') return [x, y, z + explode * 0.35];
      if (id === '07') return [x + explode * 0.35, y, z + explode * 0.1];
      if (id === '08') return [x, y, z - explode * 0.38];
    }
    
    return pos;
  }, [activeModel, explode]);


  const gridY = activeModel === 'fridge' ? -1.005 : (activeModel === 'battery' ? -0.905 : -0.605);

  const ambientIntensity = focusMode ? 2.0 : 1.5;
  const hemisphereIntensity = focusMode ? 2.2 : 1.8;
  const keyLightIntensity = focusMode ? 5.5 : 4.5;

  return (
    <>
      {/* Clean neutral studio ambient lights */}
      <ambientLight intensity={0.7} color="#ffffff" />
      <hemisphereLight skyColor="#ffffff" groundColor="#dddddd" intensity={0.8} />
      
      {/* Key Light (Neutral white studio light) */}
      <directionalLight 
        position={[8, 12, 8]} 
        intensity={1.8} 
        color="#ffffff" 
        castShadow 
      />

      {/* Fill Light (Neutral cool fill) */}
      <directionalLight 
        position={[-8, 4, 8]} 
        intensity={0.8} 
        color="#eaeaea" 
      />

      {/* Bounce Light (Neutral ground bounce) */}
      <directionalLight 
        position={[0, -5, 0]} 
        intensity={0.4} 
        color="#dddddd" 
      />

      {/* Enable environment background and blur for realistic grey gradient studio skybox */}
      <Environment files="/hdr/venice_sunset_1k.hdr" background blur={0.8} intensity={1.2} />

      {/* Tech Grid on the floor */}
      <Grid
        infiniteGrid
        renderOrder={-1}
        position={[0, gridY, 0]}
        cellSize={0.6}
        cellThickness={0.6}
        sectionSize={3.3}
        sectionThickness={1.5}
        sectionColor="#a0aab8"
        cellColor="#e2e8f0"
        fadeDistance={30}
      />
      
      <group 
        ref={groupRef} 
        rotation={[0.15, -0.4, 0]}
      >
        {/* Render selected model */}
        {activeModel === 'fridge' ? (
          <Refrigerator explode={explode} />
        ) : activeModel === 'battery' ? (
          <Battery explode={explode} />
        ) : (
          <Turbine 
            explode={explode} 
            turbineRef={turbineRef} 
            configMode={configMode}
            selectedMeshIdx={selectedMeshIdx}
            hoveredMeshIdx={hoveredMeshIdx}
          />
        )}

        {/* Render respective tag nodes */}
        {Object.entries(partsData).map(([id, item]) => {
          let explodedPos = getExplodedPosition(id, item.pos);

          // For the wind turbine, bind the tag position directly to the corresponding child mesh coordinate
          if (activeModel === 'turbine' && turbineRef.current) {
            const childIdx = partMeshIndices[id];
            if (childIdx !== undefined && childIdx !== -1) {
              const child = turbineRef.current.children[childIdx];
              if (child) {
                // Compute geometry bounding box center dynamically
                if (!child.geometry.boundingBox) {
                  child.geometry.computeBoundingBox();
                }
                const center = new THREE.Vector3();
                child.geometry.boundingBox.getCenter(center);
                // Apply the child's local transformation matrix
                center.applyMatrix4(child.matrix);

                // Apply the scaling (1.2), position [0, -0.6, 0] and rotation [0, PI/2, 0] of the parent group
                explodedPos = [
                  center.z * 1.2,
                  center.y * 1.2 - 0.6,
                  -center.x * 1.2
                ];
              }
            }
          }

          return (
            <TagNode
              key={id}
              partId={id}
              name={item.name}
              position={explodedPos}
              isSelected={selectedPartId === id}
              isHovered={hoveredPartId === id}
              onSelect={() => setSelectedPartId(id)}
              onHover={setHoveredPartId}
              explode={explode}
              desc={item.desc}
              partCode={item.id}
            />
          );
        })}

        {/* Temporary tag node helper for Configurator mode */}
        {configMode && selectedMeshIdx >= 0 && turbineRef.current && (
          (() => {
            const child = turbineRef.current.children[selectedMeshIdx];
            if (child && child.isMesh) {
              if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
              }
              const center = new THREE.Vector3();
              child.geometry.boundingBox.getCenter(center);
              center.applyMatrix4(child.matrix);
              
              const tempPos = [
                center.z * 1.2,
                center.y * 1.2 - 0.6,
                -center.x * 1.2
              ];
              
              const isAlreadyTagged = Object.entries(partMeshIndices).some(([pid, idx]) => idx === selectedMeshIdx);
              
              if (!isAlreadyTagged) {
                return (
                  <TagNode
                    key="temp-config-tag"
                    partId="?"
                    name="待配置网格"
                    position={tempPos}
                    isSelected={true}
                    isHovered={false}
                    onSelect={() => {}}
                    onHover={() => {}}
                    explode={explode}
                    desc={`网格名称: ${child.name || 'Unnamed'}`}
                    partCode={`INDEX-${selectedMeshIdx}`}
                  />
                );
              }
            }
            return null;
          })()
        )}
      </group>
    </>
  );
}

const ObjectItem = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.6rem 0.8rem;
  background: ${props => props.$active ? 'rgba(37, 99, 235, 0.15)' : 'rgba(255, 255, 255, 0.02)'};
  border: 1px solid ${props => props.$active ? 'rgba(80, 180, 255, 0.45)' : 'rgba(255, 255, 255, 0.08)'};
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.75rem;
  color: ${props => props.$active ? '#ffffff' : '#cbd5e1'};
  box-shadow: ${props => props.$active ? '0 0 12px rgba(80, 180, 255, 0.15)' : 'none'};

  &:hover {
    background: rgba(37, 99, 235, 0.08);
    border-color: rgba(37, 99, 235, 0.4);
    color: #ffffff;
  }

  .label-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .status-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${props => props.$active ? '#00f0ff' : 'transparent'};
    box-shadow: ${props => props.$active ? '0 0 6px #00f0ff' : 'none'};
  }
`;

const TreeContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding-left: 0.5rem;
  border-left: 1px dashed rgba(80, 180, 255, 0.15);
`;

const TreeItem = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: ${props => props.$active ? '#00f0ff' : '#cbd5e1'};
  background: ${props => props.$active ? 'rgba(0, 240, 255, 0.06)' : 'transparent'};
  transition: all 0.15s ease;

  &:hover {
    color: #00f0ff;
    background: rgba(0, 240, 255, 0.03);
  }

  &::before {
    content: '';
    position: absolute;
    left: -0.5rem;
    top: 50%;
    width: 0.4rem;
    height: 1px;
    border-bottom: 1px dashed rgba(80, 180, 255, 0.15);
  }
`;

const BottomDock = styled.div`
  position: absolute;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.8rem;
  background: rgba(10, 16, 27, 0.78);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(80, 180, 255, 0.22);
  box-shadow: inset 0 0 16px rgba(80, 180, 255, 0.04), 0 12px 30px rgba(0, 0, 0, 0.45);
  border-radius: 30px;
  padding: 0.5rem 1.2rem;
  z-index: 6;
  pointer-events: auto;
  transition: all 0.3s ease;

  @media (max-width: 968px) {
    position: relative;
    bottom: auto;
    left: auto;
    transform: none;
    flex-wrap: wrap;
    justify-content: center;
    border-radius: 12px;
    padding: 0.8rem;
    margin: 1rem 1.5rem;
  }

  .dock-section {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .divider {
    width: 1px;
    height: 18px;
    background: rgba(80, 180, 255, 0.15);
  }

  .label {
    font-size: 0.65rem;
    font-weight: 700;
    color: #8fa3b5;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-family: 'Outfit', sans-serif;
  }

  button {
    background: transparent;
    border: 1px solid transparent;
    color: #cbd5e1;
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.3rem 0.6rem;
    border-radius: 15px;
    display: flex;
    align-items: center;
    gap: 0.2rem;
    transition: all 0.2s ease;

    &:hover {
      background: rgba(80, 180, 255, 0.08);
      border-color: rgba(80, 180, 255, 0.2);
      color: #fff;
    }

    &.active {
      background: rgba(37, 99, 235, 0.25);
      border-color: rgba(80, 180, 255, 0.4);
      color: #00f0ff;
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.15);
    }
  }

  .zoom-display {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #00f0ff;
    min-width: 38px;
    text-align: center;
  }

  .explode-control {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;

    input[type='range'] {
      -webkit-appearance: none;
      width: 70px;
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #00f0ff;
        cursor: pointer;
        box-shadow: 0 0 4px #00f0ff;
      }
    }
  }
`;


const Sparkline = ({ color = '#00f0ff', points = [10, 25, 15, 30, 20, 35, 15, 40, 25, 30] }) => {
  const width = 80;
  const height = 16;
  const step = width / (points.length - 1);
  const pathData = points
    .map((p, index) => `${index === 0 ? 'M' : 'L'} ${index * step} ${height - (p / 45) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <path d={pathData} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d={pathData} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" opacity="0.15" style={{ filter: 'blur(1px)' }} />
    </svg>
  );
};

export default function SpatialUI() {
  const navigate = useNavigate();
  const [activeModel, setActiveModel] = useState('fridge'); // 'fridge', 'battery', 'turbine'
  const [explodeAmount, setExplodeAmount] = useState(0.0);
  
  // High-fidelity active sub-component selection state (defaults to '01')
  const [selectedPartId, setSelectedPartId] = useState('01');
  const [hoveredPartId, setHoveredPartId] = useState(null);

  // Camera view configuration states
  const [fov, setFov] = useState(48);
  const [autoRotate, setAutoRotate] = useState(true);
  const [cameraPreset, setCameraPreset] = useState(null);
  const [focusMode, setFocusMode] = useState(false);

  // Sidebar collapse states for dynamic canvas resizing
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // Temporary slide-out expanders for sidebars when focusMode is active
  const [tempTelemetryShow, setTempTelemetryShow] = useState(false);
  const [tempConfigShow, setTempConfigShow] = useState(false);

  // Tag Configuration Mode States
  const [configMode, setConfigMode] = useState(false);
  const [selectedMeshIdx, setSelectedMeshIdx] = useState(-1);
  const [hoveredMeshIdx, setHoveredMeshIdx] = useState(-1);
  const [customTurbineParts, setCustomTurbineParts] = useState(TURBINE_PARTS);
  const [meshList, setMeshList] = useState([]);
  const [partMeshIndices, setPartMeshIndices] = useState({});

  // Hook states
  const {
    trackingMode,
    setTrackingMode,
    handDetected,
    cursor,
    isPinching,
    isConnected,
    wsUrl,
    setWsUrl,
  } = useHandTracking();

  // Reset selected part when switching models
  React.useEffect(() => {
    setSelectedPartId('01');
    setMeshList([]);
    setSelectedMeshIdx(-1);
    setHoveredMeshIdx(-1);
  }, [activeModel]);

  const handleBack = () => {
    navigate('/projects');
  };

  const partsData = activeModel === 'fridge' 
    ? FRIDGE_PARTS 
    : (activeModel === 'battery' ? BATTERY_PARTS : customTurbineParts);

  const selectedPart = partsData[selectedPartId] || Object.values(partsData)[0];
  const activePart = hoveredPartId ? partsData[hoveredPartId] : selectedPart;

  const leftCollapsed = focusMode ? !tempTelemetryShow : leftSidebarCollapsed;
  const rightCollapsed = focusMode ? !tempConfigShow : rightSidebarCollapsed;

  // Hand gesture-driven explode control
  const lastYRef = useRef(0);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (trackingMode !== 'mouse' && handDetected) {
      if (isPinching) {
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          lastYRef.current = cursor.y;
        } else {
          const dy = cursor.y - lastYRef.current;
          // Pull up to explode, push down to assemble
          setExplodeAmount(prev => Math.max(0, Math.min(1, prev + dy * 2.2)));
          lastYRef.current = cursor.y;
        }
      } else {
        isDraggingRef.current = false;
      }
    }
  }, [cursor.y, isPinching, handDetected, trackingMode]);

  return (
    <PageContainer>
      <Header>
        <div className="logo-section" onClick={() => navigate('/')}>
          <span className="icon">⚙️</span>
          <h1>3D 零件拆解沙盒 · 产品配置器</h1>
        </div>
        <button className="nav-back" onClick={handleBack}>
          返回造物坊
        </button>
      </Header>

      <MainContent>
        {/* Sidebar collapse/expand trigger tabs */}
        <EdgeTab
          $left
          $collapsed={leftCollapsed}
          onClick={() => {
            if (focusMode) {
              setTempTelemetryShow(prev => !prev);
            } else {
              setLeftSidebarCollapsed(prev => !prev);
            }
          }}
        >
          {leftCollapsed ? '展开控制面板 ▶' : '◀ 收起控制面板'}
        </EdgeTab>
        
        <EdgeTab
          $collapsed={rightCollapsed}
          onClick={() => {
            if (focusMode) {
              setTempConfigShow(prev => !prev);
            } else {
              setRightSidebarCollapsed(prev => !prev);
            }
          }}
        >
          {rightCollapsed ? '◀ 展开参数配置' : '收起参数配置 ▶'}
        </EdgeTab>

        {/* Left Side: Telemetry Control Panel */}
        <Sidebar $left $collapsed={leftCollapsed}>
          <HudCard>
            <h3>交互模式</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.4rem' }}>
              {[
                { label: '鼠标轨迹', mode: TRACKING_MODES.MOUSE, icon: '🖱️' },
                { label: '手势捕捉', mode: TRACKING_MODES.CAMERA, icon: '📷' },
                { label: '仿真模拟', mode: TRACKING_MODES.SIMULATE, icon: '🌀' },
                { label: '网口服务', mode: TRACKING_MODES.WEBSOCKET, icon: '🔌' }
              ].map(m => (
                <button
                  key={m.label}
                  className={`option ${trackingMode === m.mode ? 'active' : ''}`}
                  onClick={() => setTrackingMode(m.mode)}
                  style={{
                    padding: '0.45rem',
                    fontSize: '0.65rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    justifyContent: 'center',
                    background: trackingMode === m.mode ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${trackingMode === m.mode ? '#00f0ff' : 'rgba(255,255,255,0.08)'}`,
                    color: trackingMode === m.mode ? '#fff' : '#cbd5e1',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </HudCard>

          {trackingMode === TRACKING_MODES.WEBSOCKET && (
            <HudCard>
              <h3>WebSocket 连接设置</h3>
              <div className="slider-group" style={{ marginTop: '0.2rem' }}>
                <label>服务器地址</label>
                <input
                  type="text"
                  value={wsUrl}
                  onChange={(e) => setWsUrl(e.target.value)}
                  style={{
                    background: 'rgba(15, 17, 23, 0.6)',
                    border: '1px solid rgba(80, 180, 255, 0.15)',
                    color: '#fff',
                    padding: '0.4rem',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <span className="tech-info" style={{ color: isConnected ? '#10b981' : '#ef4444', display: 'block', marginTop: '0.2rem' }}>
                {isConnected ? '● 已连接' : '○ 未连接'}
              </span>
            </HudCard>
          )}

          <HudCard>
            <h3>追踪状态</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', marginTop: '0.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem' }}>
                <span style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: handDetected ? '#10b981' : '#ef4444',
                  boxShadow: handDetected ? '0 0 6px #10b981' : '0 0 6px #ef4444'
                }} />
                <span style={{ color: '#cbd5e1', fontFamily: 'JetBrains Mono, monospace' }}>
                  {handDetected ? '在线' : '离线'}
                </span>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: '#00f0ff' }}>
                置信度: {handDetected ? '98.4%' : '0.0%'}
              </span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: handDetected ? '98.4%' : '0%', transition: 'width 0.3s ease' }} />
            </div>
          </HudCard>

          <HudCard>
            <h3>指针数据</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.2rem', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.2rem' }}>
              <div>X轴: <span style={{ color: '#fff' }}>{cursor.x.toFixed(3)}</span></div>
              <div>Y轴: <span style={{ color: '#fff' }}>{cursor.y.toFixed(3)}</span></div>
              <div>Z轴: <span style={{ color: '#fff' }}>{isPinching ? '0.214' : '0.000'}</span></div>
            </div>
            <div style={{ marginTop: '0.5rem' }}>
              <svg width="100%" height="60" style={{ background: 'rgba(0,0,0,0.22)', borderRadius: '6px', border: '1px solid rgba(80,180,255,0.1)' }}>
                <defs>
                  <pattern id="pointer-grid" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(80,180,255,0.06)" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#pointer-grid)" />
                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(80,180,255,0.15)" strokeWidth="0.5" strokeDasharray="2,2" />
                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(80,180,255,0.15)" strokeWidth="0.5" strokeDasharray="2,2" />
                <circle cx={`${50 + cursor.x * 50}%`} cy={`${50 - cursor.y * 50}%`} r="3.5" fill="#00f0ff" style={{ filter: 'drop-shadow(0 0 4px #00f0ff)', transition: 'cx 0.05s, cy 0.05s' }} />
              </svg>
            </div>
          </HudCard>

          <HudCard>
            <h3>性能诊断</h3>
            <div className="sparkline-row" style={{ marginTop: '0.2rem' }}>
              <span>帧率 (FPS): <span style={{ color: '#fff' }}>59.8</span></span>
              <Sparkline color="#00ff88" points={[15, 18, 17, 16, 20, 19, 21, 20, 18, 20]} />
            </div>
            <div className="sparkline-row">
              <span>延时: <span style={{ color: '#fff' }}>11ms</span></span>
              <Sparkline color="#ffaa00" points={[10, 8, 12, 11, 15, 12, 10, 9, 11, 8]} />
            </div>
            <div className="sparkline-row">
              <span>追踪质量: <span style={{ color: '#fff' }}>99.2%</span></span>
              <Sparkline color="#00a8ff" points={[5, 12, 18, 15, 8, 22, 14, 18, 10, 15]} />
            </div>
          </HudCard>
        </Sidebar>

        {/* Center Section: R3F Canvas Container */}
        <CanvasContainer $leftCollapsed={leftCollapsed} $rightCollapsed={rightCollapsed}>
          <ErrorBoundary>
            <Canvas
              camera={{ position: [0, 0, 4.8], fov: 48 }}
              gl={{ alpha: true, antialias: true }}
              dpr={[1, 2]}
              onCreated={({ gl }) => {
                gl.outputColorSpace = THREE.SRGBColorSpace;
                gl.toneMapping = THREE.ACESFilmicToneMapping;
                gl.toneMappingExposure = 1.45;
              }}
            >
              <Suspense fallback={null}>
                <SpatialScene
                  activeModel={activeModel}
                  explode={explodeAmount}
                  setExplode={setExplodeAmount}
                  selectedPartId={selectedPartId}
                  setSelectedPartId={setSelectedPartId}
                  fov={fov}
                  autoRotate={autoRotate}
                  cameraPreset={cameraPreset}
                  setCameraPreset={setCameraPreset}
                  focusMode={focusMode}
                  hoveredPartId={hoveredPartId}
                  setHoveredPartId={setHoveredPartId}
                  configMode={configMode}
                  selectedMeshIdx={selectedMeshIdx}
                  setSelectedMeshIdx={setSelectedMeshIdx}
                  hoveredMeshIdx={hoveredMeshIdx}
                  setHoveredMeshIdx={setHoveredMeshIdx}
                  customTurbineParts={customTurbineParts}
                  setCustomTurbineParts={setCustomTurbineParts}
                  partMeshIndices={partMeshIndices}
                  setPartMeshIndices={setPartMeshIndices}
                  onModelLoaded={setMeshList}
                />
                <OrbitControls
                  enableZoom={true}
                  enablePan={false}
                  maxDistance={8}
                  minDistance={2}
                  enabled={!handDetected}
                  onStart={() => setCameraPreset(null)}
                />
                <Preload all />
              </Suspense>
            </Canvas>
          </ErrorBoundary>

          {/* Floating Camera Control Dock */}
          <BottomDock>
            <span className="label">视角控制</span>
            <div className="divider" />
            
            <div className="dock-section">
              <button onClick={() => setFov(prev => Math.min(85, prev + 3))} title="拉远视角 (➖)">
                ➖
              </button>
              <span className="zoom-display">
                {Math.round((48 / fov) * 100)}%
              </span>
              <button onClick={() => setFov(prev => Math.max(15, prev - 3))} title="拉近视角 (➕)">
                ➕
              </button>
            </div>
            
            <div className="divider" />
            
            <div className="dock-section">
              {[
                { id: 'home', label: '重置' },
                { id: 'front', label: '前视' },
                { id: 'side', label: '侧视' },
                { id: 'top', label: '俯视' },
                { id: 'iso', label: '等轴' }
              ].map(view => (
                <button
                  key={view.id}
                  className={cameraPreset === view.id ? 'active' : ''}
                  onClick={() => setCameraPreset(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            
            <div className="divider" />
            
            <div className="dock-section explode-control">
              <span style={{ color: '#8fa3b5', fontWeight: 600 }}>拆解系数</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={explodeAmount}
                onChange={(e) => setExplodeAmount(parseFloat(e.target.value))}
              />
              <span style={{ fontFamily: 'JetBrains Mono', color: '#00f0ff', minWidth: '32px' }}>
                {Math.round(explodeAmount * 100)}%
              </span>
            </div>
            
            <div className="divider" />
            
            <button
              className={autoRotate ? 'active' : ''}
              onClick={() => setAutoRotate(prev => !prev)}
              title="切换自动旋转"
            >
              🔄 自动旋转
            </button>
            
            <div className="divider" />
            
            <button
              className={focusMode ? 'active' : ''}
              onClick={() => {
                setFocusMode(prev => {
                  const next = !prev;
                  setTempTelemetryShow(false);
                  setTempConfigShow(false);
                  return next;
                });
              }}
              style={{
                background: focusMode ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                borderColor: focusMode ? 'rgba(239, 68, 68, 0.4)' : 'transparent',
                color: focusMode ? '#ef4444' : '#cbd5e1'
              }}
            >
              🎯 {focusMode ? '退出观察' : '沉浸观察'}
            </button>
          </BottomDock>

          <div className="pip-instructions">
            💡 提示: 点击 3D 场景中的 <span style={{ color: '#00f0ff', fontWeight: 900 }}>标签点位</span> 即可高亮并追踪该零件，数据在右侧面板同步更新。
            {handDetected ? ' 捏合并上下拖拽，即可空中拆解模型。' : ' 拖拽鼠标即可旋转模型，缩放手轮可调节焦距。'}
          </div>
        </CanvasContainer>

        {/* Right Side: Model Parameter Configuration */}
        <Sidebar $right $collapsed={rightCollapsed}>
          {configMode ? (
            <HudCard style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '450px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ borderLeftColor: '#eab308' }}>🔧 标签配置中心</h3>
                <button 
                  onClick={() => setConfigMode(false)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    fontSize: '0.6rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.25)' }}
                  onMouseLeave={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.15)' }}
                >
                  退出配置
                </button>
              </div>

              {activeModel !== 'turbine' ? (
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '1rem 0' }}>
                  目前仅支持风力发电机模型的子网格标签配置。
                </div>
              ) : (
                <>
                  <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>
                    在下方列表或视口中直接点击以选中子网格进行全息标签绑定。
                  </span>

                  <div style={{ maxHeight: '130px', overflowY: 'auto', border: '1px solid rgba(80, 180, 255, 0.12)', borderRadius: '6px', padding: '0.2rem', background: 'rgba(0,0,0,0.22)', scrollbarWidth: 'thin' }}>
                    {meshList.length === 0 ? (
                      <span style={{ fontSize: '0.62rem', color: '#94a3b8', padding: '0.5rem', display: 'block' }}>模型网格加载中...</span>
                    ) : (
                      meshList.map((mesh) => {
                        const isMesh = mesh.isMesh;
                        if (!isMesh) return null;
                        const idx = mesh.index;
                        const name = mesh.name;
                        
                        const mappedPartId = Object.entries(partMeshIndices).find(([pid, mIdx]) => mIdx === idx)?.[0];
                        const isTagged = !!mappedPartId && !!customTurbineParts[mappedPartId];

                        return (
                          <div
                            key={idx}
                            onMouseEnter={() => setHoveredMeshIdx(idx)}
                            onMouseLeave={() => setHoveredMeshIdx(-1)}
                            onClick={() => setSelectedMeshIdx(idx)}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '0.25rem 0.45rem',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.62rem',
                              fontFamily: 'JetBrains Mono, monospace',
                              background: selectedMeshIdx === idx 
                                ? 'rgba(234, 158, 11, 0.18)' 
                                : (hoveredMeshIdx === idx ? 'rgba(6, 182, 212, 0.08)' : 'transparent'),
                              border: `1px solid ${selectedMeshIdx === idx 
                                ? '#eab308' 
                                : (hoveredMeshIdx === idx ? 'rgba(6, 182, 212, 0.3)' : 'transparent')}`,
                              color: isTagged ? '#00f0ff' : '#cbd5e1',
                              marginBottom: '2px'
                            }}
                          >
                            <span>#{idx.toString().padStart(2, '0')} {name}</span>
                            {isTagged && (
                              <span style={{ fontSize: '0.55rem', background: 'rgba(0, 240, 255, 0.15)', padding: '0.02rem 0.2rem', borderRadius: '3px', border: '1px solid rgba(0, 240, 255, 0.3)' }}>
                                已绑定 {mappedPartId}
                              </span>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {selectedMeshIdx >= 0 ? (
                    (() => {
                      const matchedPartId = Object.entries(partMeshIndices).find(([pid, idx]) => idx === selectedMeshIdx)?.[0];
                      const partInfo = matchedPartId ? customTurbineParts[matchedPartId] : null;

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem', flex: 1, overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#eab308' }}>
                              配置网格 #{selectedMeshIdx}
                            </span>
                            {partInfo ? (
                              <button
                                onClick={() => {
                                  const updatedParts = { ...customTurbineParts };
                                  delete updatedParts[matchedPartId];
                                  setCustomTurbineParts(updatedParts);
                                  
                                  const updatedIndices = { ...partMeshIndices };
                                  delete updatedIndices[matchedPartId];
                                  setPartMeshIndices(updatedIndices);
                                }}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.25)',
                                  color: '#ef4444',
                                  fontSize: '0.58rem',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '3px',
                                  cursor: 'pointer'
                                }}
                              >
                                移除绑定
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  const newPartId = (Object.keys(customTurbineParts).length + 1).toString().padStart(2, '0');
                                  const newPart = {
                                    id: `WT-CUSTOM-${newPartId}`,
                                    name: `自定义零件 ${newPartId}`,
                                    title: `${newPartId} 自定义零件`,
                                    desc: '请输入该零件的全息描述信息。',
                                    specs: {
                                      material: '合金钢',
                                      weight: '1.0 吨',
                                      status: '正常',
                                      temp: '25.0 ℃',
                                      vibration: '0.0 mm/s',
                                      power: '---',
                                      efficiency: '95.0%'
                                    },
                                    pos: [0, 0, 0]
                                  };
                                  setCustomTurbineParts({
                                    ...customTurbineParts,
                                    [newPartId]: newPart
                                  });
                                  setPartMeshIndices({
                                    ...partMeshIndices,
                                    [newPartId]: selectedMeshIdx
                                  });
                                }}
                                style={{
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  border: '1px solid rgba(16, 185, 129, 0.3)',
                                  color: '#10b981',
                                  fontSize: '0.58rem',
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: '3px',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                + 绑定全息标签
                              </button>
                            )}
                          </div>

                          {partInfo && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.62rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.3rem', alignItems: 'center' }}>
                                <label style={{ color: '#94a3b8' }}>标签编号 (ID):</label>
                                <input
                                  type="text"
                                  value={partInfo.id}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].id = e.target.value;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(80,180,255,0.2)', color: '#fff', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', outline: 'none' }}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '0.3rem', alignItems: 'center' }}>
                                <label style={{ color: '#94a3b8' }}>零件名称:</label>
                                <input
                                  type="text"
                                  value={partInfo.name}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].name = e.target.value;
                                    updated[matchedPartId].title = `${matchedPartId} ${e.target.value}`;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(80,180,255,0.2)', color: '#fff', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', outline: 'none' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                                <label style={{ color: '#94a3b8' }}>描述文字:</label>
                                <textarea
                                  rows={2}
                                  value={partInfo.desc}
                                  onChange={(e) => {
                                    const updated = { ...customTurbineParts };
                                    updated[matchedPartId].desc = e.target.value;
                                    setCustomTurbineParts(updated);
                                  }}
                                  style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(80,180,255,0.2)', color: '#fff', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.62rem', resize: 'none', outline: 'none' }}
                                />
                              </div>

                              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.06)', margin: '0.2rem 0' }} />

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem' }}>
                                <div>
                                  <label style={{ color: '#94a3b8', display: 'block', marginBottom: '2px' }}>重量规格:</label>
                                  <input
                                    type="text"
                                    value={partInfo.specs.weight}
                                    onChange={(e) => {
                                      const updated = { ...customTurbineParts };
                                      updated[matchedPartId].specs.weight = e.target.value;
                                      setCustomTurbineParts(updated);
                                    }}
                                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(80,180,255,0.2)', color: '#fff', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.58rem', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                                  />
                                </div>
                                <div>
                                  <label style={{ color: '#94a3b8', display: 'block', marginBottom: '2px' }}>材料特性:</label>
                                  <input
                                    type="text"
                                    value={partInfo.specs.material}
                                    onChange={(e) => {
                                      const updated = { ...customTurbineParts };
                                      updated[matchedPartId].specs.material = e.target.value;
                                      setCustomTurbineParts(updated);
                                    }}
                                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(80,180,255,0.2)', color: '#fff', padding: '0.15rem 0.3rem', borderRadius: '3px', fontSize: '0.58rem', width: '100%', boxSizing: 'border-box', outline: 'none' }}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(80, 180, 255, 0.15)', borderRadius: '6px', background: 'rgba(0,0,0,0.1)', padding: '1rem' }}>
                      <span style={{ fontSize: '0.62rem', color: '#94a3b8', textAlign: 'center' }}>未选中任何网格零件，请在 3D 视图或上方列表中选中一个部件。</span>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const exportedJson = JSON.stringify(customTurbineParts, null, 2);
                      navigator.clipboard.writeText(exportedJson);
                      alert('发电机标签配置已成功复制到剪贴板！请将其粘贴替换到 SpatialUI.jsx 中的 TURBINE_PARTS 对象中。');
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      padding: '0.45rem',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                      textAlign: 'center',
                      marginTop: '0.2rem',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 6px 14px rgba(37, 99, 235, 0.3)' }}
                    onMouseLeave={(e) => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.2)' }}
                  >
                    💾 导出并复制代码
                  </button>
                </>
              )}
            </HudCard>
          ) : (
            <>
              <HudCard>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3>展示对象库</h3>
                  {activeModel === 'turbine' && (
                    <button 
                      onClick={() => setConfigMode(true)}
                      style={{
                        background: 'rgba(80, 180, 255, 0.15)',
                        border: '1px solid rgba(80, 180, 255, 0.3)',
                        color: '#00f0ff',
                        fontSize: '0.62rem',
                        padding: '0.18rem 0.45rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.target.style.background = 'rgba(80, 180, 255, 0.25)' }}
                      onMouseLeave={(e) => { e.target.style.background = 'rgba(80, 180, 255, 0.15)' }}
                    >
                      🔧 标签配置
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.3rem' }}>
                  {[
                    { id: 'turbine', label: '风力发电机', desc: 'MW 级双馈风力发电机', icon: '⚙️' },
                    { id: 'battery', label: '电池能量包', desc: '固态聚合物电解质电池', icon: '🔋' },
                    { id: 'fridge', label: '智能冷藏柜', desc: '全息智能温控冷藏机', icon: '❄️' }
                  ].map(item => (
                    <ObjectItem
                      key={item.id}
                      $active={activeModel === item.id}
                      onClick={() => {
                        setActiveModel(item.id);
                      }}
                    >
                      <div className="label-group">
                        <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{item.label}</span>
                          <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '1px' }}>{item.desc}</span>
                        </div>
                      </div>
                      <div className="status-indicator" />
                    </ObjectItem>
                  ))}
                </div>
              </HudCard>

              <HudCard>
                <h3>零件浏览器</h3>
                <div style={{ maxHeight: '180px', overflowY: 'auto', paddingRight: '4px', scrollbarWidth: 'thin' }}>
                  <TreeContainer>
                    {Object.entries(partsData).map(([id, item]) => (
                      <TreeItem
                        key={id}
                        $active={selectedPartId === id}
                        onClick={() => setSelectedPartId(id)}
                      >
                        <span style={{ color: selectedPartId === id ? '#00f0ff' : 'rgba(80, 180, 255, 0.65)' }}>{id}</span>
                        <span>{item.name}</span>
                      </TreeItem>
                    ))}
                  </TreeContainer>
                </div>
              </HudCard>

              <HudCard style={{ flex: 1 }}>
                <h3>
                  组件全息数据
                  {hoveredPartId && (
                    <span style={{ color: '#00f0ff', fontSize: '0.62rem', marginLeft: '0.4rem', fontWeight: 500, letterSpacing: '0.05em' }}>
                      (实时预览)
                    </span>
                  )}
                </h3>
                {activePart ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: hoveredPartId ? '#00f0ff' : '#fff', transition: 'color 0.2s' }}>
                        {activePart.name}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontFamily: 'JetBrains Mono', background: 'rgba(80,180,255,0.12)', padding: '0.1rem 0.35rem', borderRadius: '4px', border: '1px solid rgba(80,180,255,0.2)' }}>
                        {activePart.id}
                      </span>
                    </div>
                    
                    <p style={{ margin: 0, fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.45 }}>
                      {activePart.desc}
                    </p>
                    
                    <div style={{ height: '1px', background: 'rgba(80, 180, 255, 0.12)', margin: '0.2rem 0' }} />
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem 0.6rem', fontSize: '0.65rem', fontFamily: 'JetBrains Mono, monospace', color: '#cbd5e1' }}>
                      <div>材料: <span style={{ color: '#fff' }}>{activePart.specs.material}</span></div>
                      <div>重量: <span style={{ color: '#fff' }}>{activePart.specs.weight}</span></div>
                      <div>状态: <span style={{ color: activePart.specs.status.includes('Active') || activePart.specs.status.includes('Running') || activePart.specs.status.includes('Healthy') || activePart.specs.status.includes('Online') || activePart.specs.status.includes('正常') || activePart.specs.status.includes('活动') || activePart.specs.status.includes('运行') || activePart.specs.status.includes('在线') ? '#10b981' : '#ffaa00' }}>
                        {activePart.specs.status}
                      </span></div>
                      <div>温度: <span style={{ color: '#fff' }}>{activePart.specs.temp}</span></div>
                      {activePart.specs.vibration && activePart.specs.vibration !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>振动: <span style={{ color: '#fff' }}>{activePart.specs.vibration}</span></div>
                      )}
                      {activePart.specs.power && activePart.specs.power !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>功率: <span style={{ color: '#fff' }}>{activePart.specs.power}</span></div>
                      )}
                      {activePart.specs.efficiency && activePart.specs.efficiency !== '---' && (
                        <div style={{ gridColumn: 'span 2' }}>效率: <span style={{ color: '#fff' }}>{activePart.specs.efficiency}</span></div>
                      )}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>请选择或悬停零件以查看其全息遥测参数</span>
                )}
              </HudCard>
            </>
          )}
        </Sidebar>
      </MainContent>
    </PageContainer>
  );
}
