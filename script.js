let chart;
let latestProfitUsd = 0;
let latestExchangeRate = 0;
let currentROI = null;

// BTC 시세를 가져오는 함수
async function fetchBTCPrice() {
  const customInput = document.getElementById("custom_btc_price");
  const customPrice = parseFloat(customInput.value);
  
  // 사용자가 이미 수동으로 입력했다면 그 값을 사용
  if (!isNaN(customPrice) && customPrice > 0) return customPrice;

  try {
    // 실시간 시세 가져오기
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await res.json();
    return data.bitcoin.usd;
  } catch (e) {
    // 실패 시 사용자에게 안내하고 수동 입력 유도
    console.error("BTC 시세 불러오기 실패:", e);
    alert("BTC 시세를 불러오지 못했습니다. 아래 입력창에 가격을 직접 입력해주세요.");
    
    // 수동 입력을 기다리도록 null 반환
    return null;
  }
}

// 환율을 가져오는 함수 (수동 입력 반영)
async function fetchExchangeRate() {
  const customRate = parseFloat(document.getElementById("custom_usd_krw").value); // 수동 입력된 환율
  if (!isNaN(customRate) && customRate > 0) {
    return customRate; // USD → KRW 환율을 그대로 반환
  }

  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD"); // 환율 API
    const data = await res.json();
    return data.rates.KRW; // API에서 받은 환율 (USD → KRW)
  } catch (e) {
    console.error("환율 불러오기 실패:", e);
    return 1300; // fallback 값 (1 USD = 1300 KRW)
  }
}

// 블록 보상량을 가져오는 함수
function getBlockReward() {
  const customBlock = parseFloat(document.getElementById("custom_block_reward").value);
  return !isNaN(customBlock) && customBlock > 0 ? customBlock : 3.125;
}

// 해시레이트 단위를 가져오는 함수
function getHashrateUnit() {
  return document.querySelector('input[name="hashrate_unit"]:checked').value;
}

// 계산을 시작하는 함수
async function calculate() {
  const hashrate = parseFloat(document.getElementById("hashrate").value);
  const powerRate = parseFloat(document.getElementById("power").value);
  const electricity = parseFloat(document.getElementById("electricity").value);
  const feePercent = parseFloat(document.getElementById("fee").value);
  const hardwareCost = parseFloat(document.getElementById("hardware_cost").value);
  const hours = parseFloat(document.getElementById("hours").value);

  const btcPrice = await fetchBTCPrice(); // 비트코인 시세
  const exchangeRate = await fetchExchangeRate(); // 환율
  latestExchangeRate = exchangeRate; // 최신 환율 저장
  const blockRewardBTC = getBlockReward();
  const blocksPerDay = 144;
  const totalNetworkDailyBTC = 462;  // 하루 전체 네트워크 채굴량 (450 + 거래 수수료 12개)
  const networkHashrate = 867000000; // TH/s 기준

  let userHashrate = hashrate;
  const unit = getHashrateUnit();
  if (unit === "GH/s") userHashrate *= 0.001;
  if (unit === "MH/s") userHashrate *= 0.000001;

  const userHashrateHps = userHashrate * 1e12;
  let dailyBTC = blockRewardBTC * blocksPerDay * (userHashrateHps / (networkHashrate * 1e12));
  dailyBTC *= (1 - feePercent / 100);

  const revenueBeforeFee = dailyBTC * btcPrice;
  const revenueAfterFee = revenueBeforeFee - (revenueBeforeFee * feePercent / 100); 
  const powerInKW = powerRate * userHashrate;
  const dailyCost = powerInKW * hours * electricity;
  const dailyProfit = revenueAfterFee - dailyCost;

  latestProfitUsd = dailyProfit;
  currentROI = dailyProfit > 0 ? Math.ceil(hardwareCost / dailyProfit) : null;

  // BTC 환산 값
  const revenueInBTC = btcPrice > 0 ? revenueAfterFee / btcPrice : 0;
  const costInBTC = btcPrice > 0 ? dailyCost / btcPrice : 0;
  const profitInBTC = btcPrice > 0 ? dailyProfit / btcPrice : 0;

  // 결과 화면에 출력
  document.getElementById("btc_price").textContent = btcPrice.toFixed(2);
  document.getElementById("daily_btc").textContent = dailyBTC.toFixed(8);
  document.getElementById("monthly_btc").textContent = (dailyBTC * 30).toFixed(8);
  document.getElementById("yearly_btc").textContent = (dailyBTC * 365).toFixed(8);

  document.getElementById("daily_rev").textContent =
    `${revenueAfterFee.toFixed(2)} (${revenueInBTC.toFixed(8)} BTC)`;
  document.getElementById("daily_cost").textContent =
    `${dailyCost.toFixed(2)} (${costInBTC.toFixed(8)} BTC)`;
  document.getElementById("daily_profit").textContent =
    `${dailyProfit.toFixed(2)} (${profitInBTC.toFixed(8)} BTC)`;

  document.getElementById("roi").textContent = currentROI ? currentROI : "수익 없음";

  document.getElementById("output").classList.add("show");

  drawChart(dailyProfit, hardwareCost, currentROI, dailyBTC);
}

// 차트 그리기
function drawChart(dailyProfit, hardwareCost, roi, dailyBTC = 0) {
  let labels = [1, 7, 30, 100, 200, 300, 365];

  if (roi) {
    const maxDay = Math.ceil(roi * 1.2); // ROI 이후도 볼 수 있도록 최대일 확장 (120%)
    for (let i = 1; i <= maxDay; i++) {
      if (![1, 7, 30, 100, 200, 300, 365].includes(i) && (i % 100 === 0 || i === roi || i === maxDay)) {
        labels.push(i);
      }
    }
  }

  labels.sort((a, b) => a - b);
  const profits = labels.map(day => +(dailyProfit * day).toFixed(2));
  const investments = labels.map(() => hardwareCost);
  const btcAmounts = labels.map(day => +(dailyBTC * day).toFixed(8));

  const barColors = labels.map(day => {
    if (roi && day === roi) return "rgba(0, 255, 0, 1)";
    if (roi && day > roi) return "rgba(255, 99, 132, 0.8)";
    return "rgba(54, 162, 235, 0.6)";
  });

  const ctx = document.getElementById("profitChart").getContext("2d");
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels.map(l => `${l}일`),
      datasets: [
        {
          type: 'line',
          label: "BTC 채굴량",
          data: btcAmounts,
          borderColor: "orange",
          backgroundColor: "rgba(255, 165, 0, 0.3)",
          yAxisID: 'y1',
          tension: 0.3,
          borderWidth: 3,
          zIndex: 100
        },
        {
          label: "순이익 ($)",
          data: profits,
          backgroundColor: barColors,
          yAxisID: 'y',
        },
        {
          label: "투자금 ($)",
          data: investments,
          backgroundColor: "rgba(128, 128, 128, 0.4)",
          yAxisID: 'y',
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        tooltip: {
          callbacks: {
            label: function(tooltipItem) {
              const datasetLabel = tooltipItem.dataset.label || '';
              const value = tooltipItem.raw;

              if (datasetLabel.includes("BTC")) {
                return `${datasetLabel}: ${parseFloat(value).toFixed(8)} BTC`;
              } else {
                return `${datasetLabel}: $${parseFloat(value).toFixed(2)}`;
              }
            }
          }
        },
        legend: { position: "top" }
      },
      scales: {
        y: {
          ticks: {
            beginAtZero: true,
            callback: value => `$${value}`
          }
        },
        y1: {
          position: "right",
          type: 'linear',
          ticks: {
            callback: value => `${value} BTC`
          }
        }
      }
    }
  });
  
  // 투자금액 회수 시점 문구 표시
  if (roi) {
    const recoveryText = document.getElementById("investmentRecoveryText");
    recoveryText.style.display = "block";
    recoveryText.innerHTML = 
      `<span class="green-circle">■</span>
      <span class="recovery-text">투자금액을 회수하는 시점은 <strong>${roi}일</strong>입니다.</span>`;
  }
}

// 환율 모달 창 열기
async function openModal() {
  const exchangeRate = await fetchExchangeRate(); // 환율을 가져옵니다.
  document.getElementById("exchangeRateDisplay").textContent = exchangeRate.toFixed(2); // USD → KRW

  const daily = latestProfitUsd * exchangeRate; // 수익에 환율을 곱합니다.
  const monthly = daily * 30;
  const yearly = daily * 365;

  document.getElementById("dailyProfitKrw").textContent = Math.round(daily).toLocaleString('ko-KR');
  document.getElementById("monthlyProfitKrw").textContent = Math.round(monthly).toLocaleString('ko-KR');
  document.getElementById("yearlyProfitKrw").textContent = Math.round(yearly).toLocaleString('ko-KR');

  document.getElementById("exchangeModal").classList.add("open");
}

// 환율 모달 창 닫기
function closeModal() {
  document.getElementById("exchangeModal").classList.remove("open");
}

// 모든 info-icon에 클릭 이벤트 추가
document.querySelectorAll('.info-icon').forEach(icon => {
  icon.addEventListener('click', showInfoModal);
});

// 다크 모드 토글
document.getElementById("toggleDarkMode").addEventListener('click', function () {
  document.body.classList.toggle('dark');
});

// 초기화 버튼
document.getElementById("resetButton").addEventListener('click', function() {
  // 필드들 초기화
  document.getElementById("hashrate").value = "";
  document.getElementById("power").value = "";
  document.getElementById("electricity").value = "";
  document.getElementById("fee").value = "";
  document.getElementById("hardware_cost").value = "";
  document.getElementById("hours").value = "";
  
  // 결과 화면 숨기기
  document.getElementById("output").classList.remove("show");
});
