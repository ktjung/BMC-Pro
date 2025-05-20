let chart;
let latestProfitUsd = 0;
let latestExchangeRate = 0;
let currentROI = null;

// 해시레이트 단위를 가져오는 함수
function getHashrateUnit() {
  return document.querySelector('input[name="hashrate_unit"]:checked').value;
}

// 비트코인 시세를 가져오는 함수
async function fetchBTCPrice() {
  const customInput = document.getElementById("custom_btc_price");
  const customPrice = parseFloat(customInput.value);

  // 사용자가 이미 수동으로 입력한 값이 있다면 그 값을 사용
  if (!isNaN(customPrice) && customPrice > 0) return customPrice;

  // 캐시된 비트코인 시세와 마지막 업데이트 시간 가져오기
  const cachedBTCPrice = localStorage.getItem("cached_btc_price");
  const cachedTime = localStorage.getItem("cached_btc_time");

  // 캐시가 존재하고, 캐시된 시세가 1시간 이내에 저장된 경우 캐시된 값 사용
  if (cachedBTCPrice && cachedTime && (Date.now() - cachedTime) < 3600000) {
    console.log("캐시된 비트코인 시세 사용");
    customInput.value = parseFloat(cachedBTCPrice).toFixed(0);  // 캐시된 시세 자동 채워넣기
    return parseFloat(cachedBTCPrice);
  }

  try {
    // API에서 실시간 BTC 시세 가져오기
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    const data = await res.json();

    // 새로운 시세를 localStorage에 저장
    const newBTCPrice = data.bitcoin.usd;
    localStorage.setItem("cached_btc_price", newBTCPrice);  // 비트코인 시세 저장
    localStorage.setItem("cached_btc_time", Date.now());   // 마지막 업데이트 시간 저장

    // 시세를 자동으로 input 필드에 채움
    customInput.value = newBTCPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    
    // 시세 반환
    return newBTCPrice;
  } catch (e) {
    // 에러가 발생했을 때, 콘솔에 에러를 찍고 사용자에게 알림을 띄움
    console.error("BTC 시세 불러오기 실패:", e);
    alert("BTC 시세를 불러올 수 없습니다. 아래 가격 입력란에 수동으로 입력해주세요.");
    
    // 사용자에게 수동 입력을 유도하기 위해 null 반환
    return null;
  }
}



// 환율을 가져오는 함수 (수동 입력 반영)
async function fetchExchangeRate() {
  const customRate = parseFloat(document.getElementById("custom_usd_krw").value);
  if (!isNaN(customRate) && customRate > 0) {
    return customRate;
  }

  try {
    const res = await fetch("https://api.exchangerate-api.com/v4/latest/USD");
    const data = await res.json();
    const rate = data.rates.KRW;

    // 자동으로 input에 채워넣기
    document.getElementById("custom_usd_krw").value = rate.toFixed(2);
    return rate;
  } catch (e) {
    console.error("환율 불러오기 실패:", e);

    // USD 시세 수동 입력을 유도
    alert("환율 정보를 불러오지 못했습니다. 아래 환율 입력란에 직접 입력해주세요.");

    return null; // 여기서 강제로 null 반환
  }
}


// 블록 보상량을 가져오는 함수
function getBlockReward() {
  const customBlock = parseFloat(document.getElementById("custom_block_reward").value);
  return !isNaN(customBlock) && customBlock > 0 ? customBlock : 3.125;
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
  if (btcPrice === null) {
    alert("비트코인 시세를 불러올 수 없습니다. 다시 시도해주세요.");
    return;
  }

  const exchangeRate = await fetchExchangeRate();
  if (exchangeRate === null) {
    return; // 환율 없으면 계산 중단
  }

  latestExchangeRate = exchangeRate; // 최신 환율 저장
  const blockRewardBTC = getBlockReward();
  const blocksPerDay = 144;
  const totalNetworkDailyBTC = 462;  // 하루 전체 네트워크 채굴량 (450 + 거래 수수료 12개)
  const networkHashrate = 867000000; // TH/s 기준

  let userHashrate = hashrate;
  const unit = getHashrateUnit();
  if (unit === "GH/s") userHashrate *= 0.001; // GH/s -> TH/s
  if (unit === "MH/s") userHashrate *= 0.000001; // MH/s -> TH/s

  const userHashrateHps = userHashrate * 1e12; // 사용자의 해시레이트 (TH/s -> H/s 변환)

  // 채굴량 계산
  let dailyBTC = totalNetworkDailyBTC * (userHashrateHps / (networkHashrate * 1e12));

  // 풀 수수료를 반영한 채굴량 계산
  const dailyBTCWithFee = dailyBTC * (1 - feePercent / 100);

  // 수익 계산 (BTC -> USD)
  const revenueBeforeFee = dailyBTCWithFee * btcPrice;
  const revenueAfterFee = revenueBeforeFee;

  // 전기세 계산
  const powerInKW = powerRate * userHashrate;
  const dailyCost = powerInKW * hours * electricity;  // 전기세 계산

  // revenueInBTC 추가 (USD를 BTC로 변환)
  const revenueInBTC = dailyBTCWithFee;  // 이미 BTC 단위로 계산된 값입니다.
  const costInBTC = dailyCost / btcPrice; // 전기세를 BTC로 변환한 값

  // 하루 이익 계산
  const dailyProfit = revenueAfterFee - dailyCost;
  latestProfitUsd = dailyProfit;

  // ROI 계산 (하루 이익 / 투자금액)
  let currentROI = null;
  if (dailyProfit > 0 && hardwareCost > 0) {
    currentROI = Math.ceil(hardwareCost / dailyProfit);
  }

  // 결과 출력
  document.getElementById("btc_price").textContent = btcPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  document.getElementById("daily_btc").textContent = dailyBTCWithFee.toFixed(8);
  document.getElementById("monthly_btc").textContent = (dailyBTCWithFee * 30).toFixed(8);
  document.getElementById("yearly_btc").textContent = (dailyBTCWithFee * 365).toFixed(8);
  document.getElementById("daily_rev").textContent = revenueAfterFee.toFixed(2);
  document.getElementById("daily_cost").textContent = dailyCost.toFixed(2);
  document.getElementById("daily_profit").textContent = dailyProfit.toFixed(2);

  // BTC로 환산된 결과도 출력
  document.getElementById("daily_rev").textContent =
    `${revenueAfterFee.toFixed(2)} (${revenueInBTC.toFixed(8)} BTC)`;
  document.getElementById("daily_cost").textContent =
    `${dailyCost.toFixed(2)} (${costInBTC.toFixed(8)} BTC)`;
  document.getElementById("daily_profit").textContent =
    `${dailyProfit.toFixed(2)} (${(dailyProfit / btcPrice).toFixed(8)} BTC)`;

  document.getElementById("roi").textContent = currentROI ? currentROI : "수익 없음";

  // 차트 그리기
  drawChart(dailyProfit, hardwareCost, currentROI, dailyBTCWithFee);

  // 결과 애니메이션
  document.getElementById("output").classList.add("show");
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
            callback: value => `$${value.toLocaleString()}`
          },
        grid: {
          drawOnChartArea: true 
          }
        },
        y1: {
          position: "right",
          type: 'linear',
          ticks: {
            callback: value => `${value} BTC`
          },
        grid: {
          drawOnChartArea: false
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
// 다크 모드 토글
document.getElementById("darkToggle").addEventListener("change", function () {
  document.body.classList.toggle("dark-mode", this.checked);
});

// 정보 모달 열기
function showInfoModal(event) {
  const type = event.target.getAttribute('data-info'); // data-info 속성 값 가져오기
  let infoText = "";

  switch (type) {
    case 'Instructions':
        infoText = "<span class=\"info-text\" style=\"display:block;text-align:left;line-height:1.6;font-size:15px;\">각 입력란에는 기본값이 세팅되어있습니다.<br><br>" +
                   "① 입력란에 각자에 맞게 값을 입력하세요<br>" +
                   "② [계산하기] 버튼을 눌러서 $(USD) 수익을 확인하세요<br>" +
                   "③ [환율적용] 버튼을 눌러서 KRW 수익을 확인하세요</span><br>" +
                   "<span style=\"color:#ff4d4d;font-size:0.9em;\">*BTC시세, USD 환율은 자동으로 현재 시세를 반영합니다.</span><br>" +
                   "<span class=\"info-text blue\" style='font-size: 0.9em;'>*각 항목별 ⓘ 버튼을 눌르면 설명이 나와있습니다.</span><br>" +
                   "변동시 직접입력하세요.";          
        break;
    case 'block_reward':
        infoText = "비트코인 블록 보상량 (현재 기본값: 3.125 BTC)<br><span style='color:#ff4d4d; font-size: 0.9em;'>*입력하지 않으면 자동으로 3.123 BTC로 적용됩니다.</span><br>변동시 직접입력하세요.";
        break;
    case 'btc_price':
        infoText = "비트코인 시세 ($USD). <br>이 값에 따라 수익이 달라집니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*입력하지 않으면 자동으로 실시간 $시세가 적용됩니다.</span>";
        break;
    case 'usd_krw':
        infoText = "1$ USD → KRW 환율 입력란입니다.<br>이를 통해 원화 수익을 계산할 수 있습니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*입력하지 않으면 자동으로 실시간 환율이 적용됩니다.</span>";
        break;

    case 'hashrate':
        infoText = "채굴 장비의 해시레이트를 단위를 선택하고 <br> 실제 해시레이트 파워를 입력하세요. <br><span style='color:#ff4d4d; font-size: 0.9em;'>*입력하지 않으면 자동으로 670 TH/s로 적용됩니다.</span>";
        break;
    case 'electricity':
        infoText = "채굴에 필요한 1시간의 <br>kw 전력 소비 비용을 의미합니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*기본값은 0.036 $/kwh로 적용됩니다. <br>값이 다르다면 수정하세요!</span>";
        break;
    case 'power':
        infoText = "장비가 채굴을 위해 사용하는<br>1시간의 kw 전기의 양입니다. <br><span style='color:#ff4d4d; font-size: 0.9em;'>*기본값은 0.019 kw/TH로 적용됩니다. <br>값이 다르다면 수정하세요!</span>";
        break;
    case 'hours':
        infoText = "하루 중 채굴하는 시간을 설정합니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*기본값은 24h로 적용됩니다. <br>값이 다르다면 수정하세요!</span>";
        break;
    case 'fee':
        infoText = "채굴 풀에서 부과하는 수수료입니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*기본값은 1%로 적용됩니다. <br>값이 다르다면 수정하세요!</span>";
        break;
    case 'hardware_cost':
        infoText = "채굴에 필요한 장비에 투자한 금액입니다.<br><span style='color:#ff4d4d; font-size: 0.9em;'>*기본값은 $10,500(USD)로 적용됩니다. <br>값이 다르다면 수정하세요!</span>";
        break;
  }

  document.getElementById("infoText").innerHTML = infoText;
  document.getElementById("infoModal").classList.add("show");
}

// 정보 모달 닫기
function closeInfoModal() {
  document.getElementById("infoModal").classList.remove("show");
}

// 모든 info-icon에 클릭 이벤트 추가
document.querySelectorAll('.info-icon').forEach(icon => {
  icon.addEventListener('click', showInfoModal);
});



