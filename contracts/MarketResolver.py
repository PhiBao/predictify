# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from genlayer import *
import json


@allow_storage
@dataclass
class Market:
    market_id: str
    question: str
    outcomes: str
    outcome_count: u32
    end_date: str
    is_active: bool
    is_resolved: bool
    resolved_outcome_index: u32
    total_pool: u256
    resolution_reasoning: str
    resolved_at: str
    dispute_deadline: str


@allow_storage
@dataclass
class Stake:
    user: Address
    outcome_index: u32
    amount: u256
    claimed: bool


@allow_storage
@dataclass
class DisputeRecord:
    market_id: str
    challenger: Address
    proposed_outcome_index: u32
    evidence_urls: str
    reasoning: str
    is_valid: bool
    reviewed: bool
    fee_held: u256
    judgment_reasoning: str


@gl.evm.contract_interface
class _EOA:
    class View:
        pass
    class Write:
        pass


def _clamp_idx(raw, max_idx):
    try:
        idx = int(float(raw))
    except (ValueError, TypeError):
        idx = 0
    if idx < 0:
        idx = 0
    if idx > max_idx:
        idx = max_idx
    return idx


class PredictMarket(gl.Contract):
    markets: TreeMap[str, Market]
    stakes: TreeMap[str, Stake]
    pool_totals: TreeMap[str, u256]
    disputes: TreeMap[str, DisputeRecord]
    dispute_count: u256
    min_stake: u256
    min_dispute_fee: u256
    owner: Address

    def __init__(self):
        self.min_stake = u256(1000000000000000)
        self.min_dispute_fee = u256(500000000000000000)
        self.dispute_count = u256(0)
        self.owner = gl.message.sender_address

    def _stake_key(self, market_id: str, user: Address, outcome_index: u32) -> str:
        return f"{market_id}:{user.as_hex}:{int(outcome_index)}"

    def _pool_key(self, market_id: str, outcome_index: u32) -> str:
        return f"{market_id}:{int(outcome_index)}"

    def _dispute_key(self, market_id: str, challenger: Address) -> str:
        return f"{market_id}:{challenger.as_hex}"

    def _ensure_market(self, market_id: str, question: str, outcomes_str: str, end_date: str) -> Market:
        m = self.markets.get(market_id)
        if m is not None:
            return m
        outcomes = [o.strip() for o in outcomes_str.split(",") if o.strip()]
        if len(outcomes) < 2:
            raise gl.vm.UserError("Market must have at least 2 outcomes")
        m = Market(
            market_id=market_id,
            question=question,
            outcomes=outcomes_str,
            outcome_count=u32(len(outcomes)),
            end_date=end_date,
            is_active=True,
            is_resolved=False,
            resolved_outcome_index=u32(0),
            total_pool=u256(0),
            resolution_reasoning="",
            resolved_at="",
            dispute_deadline="",
        )
        self.markets[market_id] = m
        return m

    def _has_losing_stake(self, market: Market, user: Address) -> bool:
        winning_idx = int(market.resolved_outcome_index)
        for i in range(int(market.outcome_count)):
            if i == winning_idx:
                continue
            key = self._stake_key(market.market_id, user, u32(i))
            s = self.stakes.get(key)
            if s is not None and s.amount > 0:
                return True
        return False

    @gl.public.write
    def register_market(self, market_id: str, question: str, outcomes_str: str, end_date: str):
        self._ensure_market(market_id, question, outcomes_str, end_date)

    @gl.public.write.payable
    def stake(self, market_id: str, question: str, outcomes_str: str, end_date: str, outcome_index: u32):
        amount = gl.message.value
        market = self._ensure_market(market_id, question, outcomes_str, end_date)
        if not market.is_active:
            raise gl.vm.UserError("Market is not active")
        if market.is_resolved:
            raise gl.vm.UserError("Market is already resolved")
        if outcome_index >= market.outcome_count:
            raise gl.vm.UserError("Invalid outcome index")
        if amount < self.min_stake:
            raise gl.vm.UserError("Stake amount too small")
        sender = gl.message.sender_address
        stake_key = self._stake_key(market_id, sender, outcome_index)
        pool_key = self._pool_key(market_id, outcome_index)
        existing = self.stakes.get(stake_key)
        if existing is not None:
            existing.amount += amount
        else:
            self.stakes[stake_key] = Stake(
                user=sender,
                outcome_index=outcome_index,
                amount=amount,
                claimed=False,
            )
        current_total = self.pool_totals.get(pool_key, u256(0))
        self.pool_totals[pool_key] = current_total + amount
        market.total_pool += amount
        self.markets[market_id] = market

    @gl.public.write
    def resolve_market(self, market_id: str, question: str, outcomes_str: str, end_date: str):
        market = self._ensure_market(market_id, question, outcomes_str, end_date)
        if market.is_resolved:
            raise gl.vm.UserError("Market already resolved")
        outcome_count = int(market.outcome_count)

        def leader_fn():
            prompt = (
                f"You are an impartial market resolver. You MUST choose exactly one winning outcome.\n"
                f"Market question: {market.question}\n"
                f"Possible outcomes: {market.outcomes}\n"
                f"End date: {market.end_date}\n\n"
                f"CRITICAL: You MUST select exactly one outcome_index from 0 to {outcome_count - 1}.\n"
                f"Never refuse to answer. Never say you cannot determine. Always pick the most likely outcome.\n"
                f"Respond with ONLY a JSON object with these fields:\n"
                f'- "outcome_index": integer (0 to {outcome_count - 1}, REQUIRED)\n'
                f'- "reasoning": string explaining your decision (REQUIRED)'
            )
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise gl.vm.UserError("LLM returned non-dict response")
            idx = _clamp_idx(result.get("outcome_index", 0), outcome_count - 1)
            reasoning = str(result.get("reasoning", "AI resolved based on available evidence"))
            return {"outcome_index": idx, "reasoning": reasoning}

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            if "outcome_index" not in leader_data:
                return False
            try:
                validator_data = leader_fn()
                return leader_data["outcome_index"] == validator_data["outcome_index"]
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        outcome_index = u32(_clamp_idx(result["outcome_index"], outcome_count - 1))
        now_dt = datetime.now(timezone.utc)
        dispute_dt = now_dt + timedelta(days=1)
        market.is_resolved = True
        market.resolved_outcome_index = outcome_index
        market.resolution_reasoning = str(result.get("reasoning", ""))
        market.resolved_at = now_dt.isoformat()
        market.dispute_deadline = dispute_dt.isoformat()
        self.markets[market_id] = market

    @gl.public.write.payable
    def dispute_resolution(self, market_id: str, evidence_urls: str, reasoning: str):
        if gl.message.value < self.min_dispute_fee:
            raise gl.vm.UserError("Dispute fee too low")
        sender = gl.message.sender_address
        market = self.markets.get(market_id)
        if market is None or not market.is_resolved:
            raise gl.vm.UserError("Market not resolved yet")
        if market.dispute_deadline:
            deadline_dt = datetime.fromisoformat(market.dispute_deadline)
            if datetime.now(timezone.utc) > deadline_dt:
                raise gl.vm.UserError("Dispute period has expired")
        dispute_key = self._dispute_key(market_id, sender)
        existing = self.disputes.get(dispute_key)
        if existing is not None and existing.reviewed:
            raise gl.vm.UserError("You already disputed this market")
        if not self._has_losing_stake(market, sender):
            raise gl.vm.UserError("Only losing-side stakers can dispute")
        outcome_count = int(market.outcome_count)
        current_outcome = int(market.resolved_outcome_index)
        current_reasoning = market.resolution_reasoning

        def leader_fn():
            prompt = (
                f"You are an impartial dispute reviewer. You MUST make a definitive ruling.\n"
                f"Market question: {market.question}\n"
                f"Possible outcomes: {market.outcomes}\n"
                f"Current resolution: outcome index {current_outcome}\n"
                f"Current reasoning: {current_reasoning}\n\n"
                f"Dispute details:\n"
                f"- Challenger evidence: {evidence_urls}\n"
                f"- Challenger reasoning: {reasoning}\n\n"
                f"You MUST decide if the dispute is valid and pick the correct outcome.\n"
                f"Never refuse to answer. Always make a definitive ruling.\n"
                f"Respond with ONLY a JSON object with these fields:\n"
                f'- "is_valid": boolean (true if the dispute is correct, false otherwise)\n'
                f'- "correct_outcome_index": integer (0 to {outcome_count - 1}, the true winning outcome)\n'
                f'- "reasoning": string explaining your judgment'
            )
            result = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(result, dict):
                raise gl.vm.UserError("LLM returned non-dict response")
            is_valid = bool(result.get("is_valid", False))
            idx = _clamp_idx(result.get("correct_outcome_index", current_outcome), outcome_count - 1)
            judgment_reasoning = str(result.get("reasoning", "AI reviewed the dispute and made a ruling"))
            return {"is_valid": is_valid, "correct_outcome_index": idx, "reasoning": judgment_reasoning}

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            leader_data = leader_result.calldata
            if not isinstance(leader_data, dict):
                return False
            if "is_valid" not in leader_data or "correct_outcome_index" not in leader_data:
                return False
            try:
                validator_data = leader_fn()
                return (
                    leader_data["is_valid"] == validator_data["is_valid"]
                    and leader_data["correct_outcome_index"] == validator_data["correct_outcome_index"]
                )
            except Exception:
                return False

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        is_valid = bool(result["is_valid"])
        correct_index = u32(_clamp_idx(result["correct_outcome_index"], outcome_count - 1))
        judgment_reasoning = str(result.get("reasoning", ""))
        fee = gl.message.value
        self.dispute_count += 1
        self.disputes[dispute_key] = DisputeRecord(
            market_id=market_id,
            challenger=sender,
            proposed_outcome_index=correct_index,
            evidence_urls=evidence_urls,
            reasoning=reasoning,
            is_valid=is_valid,
            reviewed=True,
            fee_held=fee,
            judgment_reasoning=judgment_reasoning,
        )
        market.dispute_deadline = ""
        if is_valid:
            market.resolved_outcome_index = correct_index
            market.resolution_reasoning = judgment_reasoning
            _EOA(sender).emit_transfer(value=fee, on='finalized')
        self.markets[market_id] = market

    @gl.public.write
    def claim_winnings(self, market_id: str):
        market = self.markets.get(market_id)
        if market is None:
            raise gl.vm.UserError("Market not found")
        if not market.is_resolved:
            raise gl.vm.UserError("Market not resolved yet")
        if market.dispute_deadline:
            deadline_dt = datetime.fromisoformat(market.dispute_deadline)
            if datetime.now(timezone.utc) <= deadline_dt:
                raise gl.vm.UserError("Dispute period still active")
        sender = gl.message.sender_address
        stake_key = self._stake_key(market_id, sender, market.resolved_outcome_index)
        stake = self.stakes.get(stake_key)
        if stake is None:
            raise gl.vm.UserError("No stake on winning outcome")
        if stake.claimed:
            raise gl.vm.UserError("Winnings already claimed")
        winning_pool = self.pool_totals.get(
            self._pool_key(market_id, market.resolved_outcome_index), u256(0)
        )
        winnings = u256(0)
        if winning_pool > 0:
            winnings = (stake.amount * market.total_pool) // winning_pool
        else:
            winnings = stake.amount
        stake.claimed = True
        self.stakes[stake_key] = stake
        if winnings > 0:
            _EOA(sender).emit_transfer(value=winnings, on='finalized')

    @gl.public.view
    def get_stake(self, market_id: str, user_hex: str, outcome_index: u32) -> str:
        key = f"{market_id}:{user_hex}:{int(outcome_index)}"
        stake = self.stakes.get(key)
        if stake is None:
            return json.dumps({"exists": False, "amount": 0})
        return json.dumps({
            "exists": True,
            "amount": int(stake.amount),
            "claimed": stake.claimed,
        })

    @gl.public.view
    def get_market(self, market_id: str) -> str:
        m = self.markets.get(market_id)
        if m is None:
            return json.dumps(None)
        return json.dumps({
            "market_id": m.market_id,
            "question": m.question,
            "outcomes": m.outcomes,
            "outcome_count": int(m.outcome_count),
            "end_date": m.end_date,
            "is_active": m.is_active,
            "is_resolved": m.is_resolved,
            "resolved_outcome_index": int(m.resolved_outcome_index),
            "total_pool": int(m.total_pool),
            "resolution_reasoning": m.resolution_reasoning,
            "resolved_at": m.resolved_at,
            "dispute_deadline": m.dispute_deadline,
        })

    @gl.public.view
    def get_all_pools(self, market_id: str) -> str:
        m = self.markets.get(market_id)
        if m is None:
            return json.dumps([])
        pools = []
        i = u32(0)
        while i < m.outcome_count:
            key = self._pool_key(market_id, i)
            amount = self.pool_totals.get(key, u256(0))
            pools.append({"outcome_index": int(i), "amount": int(amount)})
            i = u32(int(i) + 1)
        return json.dumps(pools)

    @gl.public.view
    def get_user_stakes(self, market_id: str, user_hex: str) -> str:
        m = self.markets.get(market_id)
        if m is None:
            return json.dumps([])
        stakes_list = []
        i = u32(0)
        while i < m.outcome_count:
            key = f"{market_id}:{user_hex}:{int(i)}"
            stake = self.stakes.get(key)
            if stake is not None and stake.amount > 0:
                stakes_list.append({
                    "market_id": market_id,
                    "user": stake.user.as_hex,
                    "outcome_index": int(stake.outcome_index),
                    "amount": int(stake.amount),
                    "claimed": stake.claimed,
                })
            i = u32(int(i) + 1)
        return json.dumps(stakes_list)

    @gl.public.view
    def get_dispute(self, market_id: str, challenger_hex: str) -> str:
        key = f"{market_id}:{challenger_hex}"
        d = self.disputes.get(key)
        if d is None:
            return json.dumps(None)
        return json.dumps({
            "market_id": d.market_id,
            "challenger": d.challenger.as_hex,
            "proposed_outcome_index": int(d.proposed_outcome_index),
            "evidence_urls": d.evidence_urls,
            "reasoning": d.reasoning,
            "is_valid": d.is_valid,
            "reviewed": d.reviewed,
            "judgment_reasoning": d.judgment_reasoning,
        })

    @gl.public.view
    def get_dispute_count(self) -> u256:
        return self.dispute_count

    @gl.public.view
    def get_contract_balance(self) -> u256:
        return self.balance

    @gl.public.view
    def get_min_stake(self) -> u256:
        return self.min_stake

    @gl.public.view
    def get_min_dispute_fee(self) -> u256:
        return self.min_dispute_fee
