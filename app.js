const contractAddress = "0xf325B773117764446CDAb54a5f485Ed439e889f5";
const adminAddress = "0x65C29c8A2653Aa4133a0ceF5Efd30A9A1d6A7d67";

let web3;
let contract;
let contractABI;

let startTime;
let endTime;

async function init() {
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            await loadABI();
            contract = new web3.eth.Contract(contractABI, contractAddress);
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            const accounts = await web3.eth.getAccounts();
            document.getElementById('accounts').innerText = `已連接帳戶: ${accounts[0]}`;
            document.getElementById('adminFunc').style.display = (accounts[0] == adminAddress)? "block": "none";
            document.getElementById('voterFunc').style.display = (accounts[0] != adminAddress)? "block": "none";
            await setTimeInfo();
        } catch (error) {
            document.getElementById('accounts').innerText = `連接錢包失敗: ${error.message}`;
            return;
        }
    } else {
        document.getElementById('accounts').innerText = '請安裝 MetaMask 或其他以太坊錢包。';
        return;
    }
}

async function loadABI() {
    try {
        const response = await fetch('./abi/Voting.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        contractABI = data.abi;
    } catch (error) {
        console.error('loadABI Error:', error);
    }
}

async function setTimeInfo() {
    const maxUint256 = '115792089237316195423570985008687907853269984665640564039457584007913129639935'; // type(uint256).max 的字串表示
    try {
        startTime = await contract.methods.startTime().call();
        endTime = await contract.methods.endTime().call();

        if (startTime === maxUint256) {
            document.getElementById('TimeState').innerHTML = `
            <b>【 提案階段 】</b><br/>
            管理員可以註冊投票者<br/>
            投票者可以發起提案`;
            document.getElementById('TimeVote').style.display = "none";
        } else {
            document.getElementById('registBtn').style.display = "none";
            document.getElementById('startVoteBtn').style.display = "none";
            document.getElementById('proposeBtn').style.display = "none";
            document.getElementById('voteBtn').style.display = "block";

            document.getElementById('TimeVote').style.display = "block";
            const startTimeDate = new Date(parseInt(startTime) * 1000);
            startTimeDisplay.innerText = `投票開始時間：${startTimeDate.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            const endTimeDate = new Date(parseInt(endTime) * 1000);
            endTimeDisplay.innerText = `投票結束時間：${endTimeDate.toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
            const now = new Date();
            if(now <= endTimeDate) {
                document.getElementById('TimeState').innerHTML = `<b>【 投票階段 】</b>`;
            } else {
                document.getElementById('TimeState').innerHTML = `<b>【 投票結束 】</b>`;
                document.getElementById('restartBtn').style.display = "block";
                document.getElementById('voteBtn').style.display = "none";
                showResult()
            }
        }
    } catch (error) {
        console.log(`setTimeInfo Error: ${error.message}`);
    }
}

async function registerVoter() {
    let update = false;
    const voterAddress = document.getElementById('voterAddress').value;
    const voterWeight = document.getElementById('voterWeight').value;
    try {
        if (voterAddress == adminAddress) {
            alert(`管理員不可為投票者！`);
            return;
        }
        const state = await contract.methods.getVoterState(voterAddress).call();
        if (state.weight > 0) {
            update = confirm(`投票者已經註冊，是否更新其權重？`)
            if(!update) return;
        }
        const accounts = await web3.eth.getAccounts();
        await contract.methods.registVoter(voterAddress, voterWeight).send({ from: accounts[0] });
        if (!update){
            alert(`【註冊成功】\n地址：${voterAddress}\n權重：${voterWeight}`);
        } else {
            alert(`【更新權重】\n地址：${voterAddress}\n新權重：${voterWeight}`);
        }
    } catch (error) {
        console.log(`registerVoter Error: ${error.message}`);
    }
}

async function propose() {
    try {
        const accounts = await web3.eth.getAccounts();
        const voter = await contract.methods.getVoterState(accounts[0]).call();
        if (voter.weight == 0) {
            alert(`管理員須先註冊投票者身分才可提案。`);
            return;
        }
        if (voter.Proposed) {
            alert(`已經提案過，不可重複提案。`);
            return;
        }
        await contract.methods.propose().send({ from: accounts[0] });
        alert('成功提出提案');
    } catch (error) {
        console.log(`propose Error: ${error.message}`);
    }
}

async function startVoting() {
    try {
        const voterCount = await contract.methods.voterCount().call();
        const proposalCount = await contract.methods.proposalCount().call();
        if (voterCount == 0){
            alert("尚無投票者註冊，無法開始投票階段");
            return
        }
        if (proposalCount == 0){
            alert("尚無提案被發起，無法開始投票階段");
            return
        } 
        const accounts = await web3.eth.getAccounts();
        await contract.methods.startVote().send({ from: accounts[0] });
        alert('開始投票階段');
        document.getElementById('registBtn').style.display = "none";
        document.getElementById('startVoteBtn').style.display = "none";
        document.getElementById('proposeBtn').style.display = "none";
        document.getElementById('voteBtn').style.display = "block";
        await setTimeInfo();

        setTimeout(async () => {
            alert('投票時間到，自動結算投票結果');
            await endVoting();
            await setTimeInfo();
        }, 120000);
    } catch (error) {
        console.log(`startVoting Error: ${error.message}`);
    }
}

async function vote() {
    const proposalId = document.getElementById('voteProposalId').value;
    const count = await contract.methods.proposalCount().call();
    if (proposalId > count || proposalId < 1) {
        alert("提案不存在，請輸入正確的提案編號。");
        return
    }
    try {
        const accounts = await web3.eth.getAccounts();
        const voter = await contract.methods.getVoterState(accounts[0]).call();
        if (voter.weight == 0) {
            alert(`管理員須先註冊投票者身分才可投票。`);
            return;
        }
        if (voter.Voted) {
            alert(`已經投票過，不可重複投票。`);
            return;
        }
        await contract.methods.vote(proposalId).send({ from: accounts[0] });
        alert(`投票成功，投票給提案#${proposalId}`);
    } catch (error) {
        console.log(`vote Error: ${error.message}`);
    }
}

async function endVoting() {
    try {
        const accounts = await web3.eth.getAccounts();
        await contract.methods.endVote().send({ from: accounts[0] });
        document.getElementById('restartBtn').style.display = "block";
        document.getElementById('voteBtn').style.display = "none";
    } catch (error) {
        console.log(`endVoting Error: ${error.message}`);
    }
}
async function showResult() {
    try {
        const resultDiv = document.getElementById('voteResult');
        resultDiv.style.display = "block";
        resultDiv.innerHTML = '<br/><b>最高票提案<b/>';
        let winnerFound = false;
        const count = await contract.methods.proposalCount().call();
        for (let i = 1; i <= count; i++) {
            const proposal = await contract.methods.proposals(i).call();
            if (proposal.isWinner){
                const winElement = document.createElement('div');
                winElement.innerHTML = `
                    <div>[提案 #${i}]</div>
                    <div>提出者: ${proposal.proposer}</div>
                    <div>得票數: ${proposal.voteCount}</div>
                `;
                winElement.style.marginBottom = '5px';
                resultDiv.appendChild(winElement);
                winnerFound = true;
            }
        }

        if (!winnerFound) {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = '沒有任何提案。';
            resultDiv.appendChild(tempDiv);
        }
    } catch (error) {
        console.log(`showResult Error: ${error.message}`);
    }
}
async function restartVoting() {
    try {
        const accounts = await web3.eth.getAccounts();
        await contract.methods.restart().send({ from: accounts[0] });
        window.location.reload();
    } catch (error) {
        console.log(`restartVoting Error: ${error.message}`);
    }
}

async function getProposalInfo(state) {
    const proposalsDiv = (state == 1)? document.getElementById('proposalInfo') : document.getElementById('proposalInfo2');
    proposalsDiv.innerHTML = '';
    try {
        const count = await contract.methods.proposalCount().call();
        if (count == 0) {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = '尚無提案。';
            proposalsDiv.appendChild(tempDiv);
        }
        for (let i = 1; i <= count; i++) {
            const proposal = await contract.methods.proposals(i).call();
            const proposalElement = document.createElement('div');
            proposalElement.innerHTML = `
                <div>[提案 #${i}]<\div>
                <div>提出者: ${proposal.proposer}</div>
                <div>得票數: ${proposal.voteCount}</div>
                <div>是否獲勝: ${proposal.isWinner}</div>
            `;
            proposalElement.style.marginBottom = '5px';
            proposalsDiv.appendChild(proposalElement);
        }
    } catch (error) {
        console.log(`getProposalInfo Error: ${error.message}`);
    }
}

async function getAllVoterInfo() {
    const voterInfoDiv = document.getElementById('voterInfo');
    voterInfoDiv.innerHTML = '';
    try {
        const count = await contract.methods.voterCount().call();
        if (count == 0) {
            const tempDiv = document.createElement('div');
            tempDiv.textContent = '尚無投票者註冊。';
            voterInfoDiv.appendChild(tempDiv);
        }
        for (let i = 1; i <= count; i++) {
            const voterAddr = await contract.methods.voterList(i).call();
            const voter = await contract.methods.getVoterState(voterAddr).call();
            const voterElement = document.createElement('div');
            voterElement.innerHTML = `
                <div>[投票者 #${i}]<\div>
                <div>錢包地址: ${voterAddr}</div>
                <div>已提案: ${voter.Proposed}</div>
                <div>已投票: ${voter.Voted}</div>
                <div>權重: ${voter.weight}</div>
            `;
            voterElement.style.marginBottom = '5px';
            voterInfoDiv.appendChild(voterElement);
        }
    } catch (error) {
        console.log(`getAllVoterInfo Error: ${error.message}`);
    }
}

async function getVoterStateInfo() {
    const voterInfoDiv = document.getElementById('voterInfo2');
    voterInfoDiv.innerHTML = '';
    try {
        const accounts = await web3.eth.getAccounts();
        const voter = await contract.methods.getVoterState(accounts[0]).call();
        voterInfoDiv.innerHTML = (voter.weight == 0)?
            `尚未註冊，請先由管理員註冊後才可提案和投票。`:`
            <div>已提案: ${voter.Proposed}</div>
            <div>已投票: ${voter.Voted}</div>
            <div>權重: ${voter.weight}</div>`;
    } catch (error) {
        console.log(`getVoterStateInfo Error: ${error.message}`);
    }
}
window.onload = init;