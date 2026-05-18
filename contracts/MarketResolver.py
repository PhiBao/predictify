# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from dataclasses import dataclass
from genlayer import *


@allow_storage
@dataclass
class Market:
    market_id: str
    question: str
    description: str
    outcomes: str
    outcome_count: u32
    creator: Address
    end_date: str
    is_active: bool
    is_resolved: bool
    resolved_outcome_index: u32
    created_at: str


@allow_storage
@dataclass
class Position:
    market_id: str
    user: str
    outcome_index: u32
    shares: u256
    avg_price: u256


@allow_storage
@dataclass
class Trade:
    trade_id: u256
    market_id: str
    user: str
    outcome_index: u32
    shares: u256
    price_per_share: u256
    total_cost: u256
    trade_type: str
    timestamp: str


@allow_storage
@dataclass
class ResolutionResult:
    market_id: str
    resolved_outcome: str
    resolved_outcome_index: u32
    confidence: u32
    reasoning: str
    timestamp: str
    resolver: Address
    is_finalized: bool


@allow_storage
@dataclass
class DisputeRecord:
    market_id: str
    resolution_id: u256
    challenger: Address
    proposed_outcome: str
    proposed_outcome_index: u32
    evidence_url: str
    reasoning: str
    timestamp: str
    is_valid: bool
    reviewed: bool


class PredictMarket(gl.Contract):
    markets: TreeMap[str, Market]
    positions: TreeMap[str, Position]
    trades: TreeMap[u256, Trade]
    trade_count: u256
    resolutions: TreeMap[u256, ResolutionResult]
    resolution_count: u256
    disputes: TreeMap[u256, DisputeRecord]
    dispute_count: u256
    market_resolutions: TreeMap[str, u256]
    min_resolution_fee: u256
    min_dispute_fee: u256
    owner: Address

    def __init__(self):
        self.trade_count = u256(0)
        self.resolution_count = u256(0)
        self.dispute_count = u256(0)
        self.min_resolution_fee = u256(2000000000000000000)
        self.min_dispute_fee = u256(500000000000000000)
        self.owner = gl.message.sender_address

    def _make_position_key(self, market_id: str, user: str, outcome_index: u32) -> str:
        return market_id + "|" + user + "|" + str(int(outcome_index))

    def _ensure_market(
        self,
        market_id: str,
        question: str,
        outcomes_str: str,
        end_date: str,
    ) -> Market:
        market = self.markets.get(market_id)
        if market is not None:
            return market

        outcomes = [o.strip() for o in outcomes_str.split(",") if o.strip()]
        if len(outcomes) < 2:
            raise gl.UserError("Market must have at least 2 outcomes")

        market = Market(
            market_id=market_id,
            question=question,
            description="",
            outcomes=outcomes_str,
            outcome_count=u32(len(outcomes)),
            creator=gl.message.sender_address,
            end_date=end_date,
            is_active=True,
            is_resolved=False,
            resolved_outcome_index=u32(0),
            created_at=str(gl.message.timestamp),
        )
        self.markets[market_id] = market
        return market

    @gl.public.write
    def create_market(
        self,
        market_id: str,
        question: str,
        description: str,
        outcomes_str: str,
        end_date: str,
    ):
        if gl.message.sender_address != self.owner:
            raise gl.UserError("Only owner can create markets")

        existing = self.markets.get(market_id)
        if existing is not None:
            raise gl.UserError("Market already exists")

        outcomes = [o.strip() for o in outcomes_str.split(",") if o.strip()]
        if len(outcomes) < 2:
            raise gl.UserError("Market must have at least 2 outcomes")

        market = Market(
            market_id=market_id,
            question=question,
            description=description,
            outcomes=outcomes_str,
            outcome_count=u32(len(outcomes)),
            creator=gl.message.sender_address,
            end_date=end_date,
            is_active=True,
            is_resolved=False,
            resolved_outcome_index=u32(0),
            created_at=str(gl.message.timestamp),
        )

        self.markets[market_id] = market

    @gl.public.write.payable
    def buy_shares(
        self,
        market_id: str,
        question: str,
        outcomes_str: str,
        end_date: str,
        outcome_index: u32,
    ):
        payment = gl.message.value
        if payment == u256(0):
            raise gl.UserError("Payment required")

        market = self._ensure_market(market_id, question, outcomes_str, end_date)

        if not market.is_active:
            raise gl.UserError("Market is not active")
        if market.is_resolved:
            raise gl.UserError("Market is already resolved")
        if outcome_index >= market.outcome_count:
            raise gl.UserError("Invalid outcome index")

        user_hex = gl.message.sender_address.as_hex
        pos_key = self._make_position_key(market_id, user_hex, outcome_index)
        
        pos = self.positions.get(pos_key)
        if pos is None:
            pos = Position(
                market_id=market_id,
                user=user_hex,
                outcome_index=outcome_index,
                shares=u256(0),
                avg_price=u256(0),
            )

        price_per_share = u256(500000000000000000)

        shares_to_buy = u256(int(payment) // int(price_per_share))
        if shares_to_buy == u256(0):
            raise gl.UserError("Payment too small for any shares")

        old_shares = pos.shares
        old_avg = pos.avg_price
        pos.shares = u256(int(old_shares) + int(shares_to_buy))
        total_cost_val = u256(int(old_shares) * int(old_avg) + int(shares_to_buy) * int(price_per_share))
        pos.avg_price = u256(int(total_cost_val) // int(pos.shares)) if pos.shares > u256(0) else u256(0)
        self.positions[pos_key] = pos

        self.trade_count = u256(int(self.trade_count) + 1)
        trade = Trade(
            trade_id=self.trade_count,
            market_id=market_id,
            user=user_hex,
            outcome_index=outcome_index,
            shares=shares_to_buy,
            price_per_share=price_per_share,
            total_cost=payment,
            trade_type="buy",
            timestamp=str(gl.message.timestamp),
        )
        self.trades[self.trade_count] = trade

    @gl.public.write
    def sell_shares(self, market_id: str, outcome_index: u32, shares_amount: u256):
        if shares_amount == u256(0):
            raise gl.UserError("Cannot sell zero shares")

        market = self.markets.get(market_id)
        if market is None:
            raise gl.UserError("Market not found")

        user_hex = gl.message.sender_address.as_hex
        pos_key = self._make_position_key(market_id, user_hex, outcome_index)
        pos = self.positions.get(pos_key)
        if pos is None or pos.shares == u256(0):
            raise gl.UserError("No shares to sell")
        if shares_amount > pos.shares:
            raise gl.UserError("Insufficient shares")

        price_per_share = pos.avg_price
        if market.is_resolved:
            if outcome_index == market.resolved_outcome_index:
                price_per_share = u256(1000000000000000000)
            else:
                price_per_share = u256(0)

        payout = u256(int(shares_amount) * int(price_per_share) // 1000000000000000000)
        pos.shares = u256(int(pos.shares) - int(shares_amount))
        self.positions[pos_key] = pos

        self.trade_count = u256(int(self.trade_count) + 1)
        trade = Trade(
            trade_id=self.trade_count,
            market_id=market_id,
            user=user_hex,
            outcome_index=outcome_index,
            shares=shares_amount,
            price_per_share=price_per_share,
            total_cost=payout,
            trade_type="sell",
            timestamp=str(gl.message.timestamp),
        )
        self.trades[self.trade_count] = trade

    @gl.public.write.payable
    def resolve_market(self, market_id: str):
        fee = gl.message.value
        if fee < self.min_resolution_fee:
            raise gl.UserError("Insufficient resolution fee")

        market = self.markets.get(market_id)
        if market is None:
            raise gl.UserError("Market not found")
        if market.is_resolved:
            raise gl.UserError("Market already resolved")

        existing = self.market_resolutions.get(market_id, u256(0))
        if existing != u256(0):
            existing_res = self.resolutions.get(existing)
            if existing_res is not None and existing_res.is_finalized:
                raise gl.UserError("Market already resolved")

        outcomes = [o.strip() for o in market.outcomes.split(",") if o.strip()]
        outcome_list = ", ".join(outcomes)

        prompt = (
            "You are an impartial market resolver. Determine the OUTCOME of this prediction market "
            "based on available evidence and real-world facts.\n\n"
            "Market ID: " + market_id + "\n"
            "Question: " + market.question + "\n"
            "Description: " + market.description + "\n"
            "Possible Outcomes: " + outcome_list + "\n\n"
            "Research the current state of affairs and determine which outcome has occurred. "
            "You MUST pick exactly ONE outcome from the list above.\n\n"
            "Return your resolution in JSON format:\n"
            "- resolved_outcome: exact name of the winning outcome\n"
            "- resolved_outcome_index: 0-based index of the winning outcome\n"
            "- confidence: 0-100 integer\n"
            "- reasoning: detailed explanation"
        )

        def leader_fn():
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            return response

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            validator_response = leader_fn()
            leader_data = leader_result.calldata
            validator_data = validator_response
            leader_outcome = leader_data.get("resolved_outcome", "")
            validator_outcome = validator_data.get("resolved_outcome", "")
            return leader_outcome == validator_outcome

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        self.resolution_count = u256(int(self.resolution_count) + 1)
        resolution_id = self.resolution_count

        resolution = ResolutionResult(
            market_id=market_id,
            resolved_outcome=str(result.get("resolved_outcome", "")),
            resolved_outcome_index=u32(int(result.get("resolved_outcome_index", 0))),
            confidence=u32(int(result.get("confidence", 50))),
            reasoning=str(result.get("reasoning", "")),
            timestamp=str(gl.message.timestamp),
            resolver=gl.message.sender_address,
            is_finalized=False,
        )

        self.resolutions[resolution_id] = resolution
        self.market_resolutions[market_id] = resolution_id

        market.is_resolved = True
        market.resolved_outcome_index = resolution.resolved_outcome_index
        self.markets[market_id] = market

    @gl.public.write.payable
    def dispute_resolution(self, resolution_id: u256, market_id: str, evidence_url: str, reasoning: str):
        fee = gl.message.value
        if fee < self.min_dispute_fee:
            raise gl.UserError("Insufficient dispute fee")

        if resolution_id == u256(0) or resolution_id > self.resolution_count:
            raise gl.UserError("Invalid resolution ID")

        resolution = self.resolutions.get(resolution_id)
        if resolution is None:
            raise gl.UserError("Resolution not found")

        if resolution.is_finalized:
            raise gl.UserError("Resolution is already finalized")

        if resolution.market_id != market_id:
            raise gl.UserError("Resolution ID does not match market ID")

        market = self.markets.get(market_id)
        if market is None:
            raise gl.UserError("Market not found")

        outcomes = [o.strip() for o in market.outcomes.split(",") if o.strip()]
        outcome_list = ", ".join(outcomes)

        prompt = (
            "A dispute has been filed against a market resolution. Review the evidence and determine "
            "if the current resolution is correct or should be overturned.\n\n"
            "Market ID: " + market_id + "\n"
            "Question: " + market.question + "\n"
            "Possible Outcomes: " + outcome_list + "\n"
            "Current Resolution: " + resolution.resolved_outcome + " (index " + str(int(resolution.resolved_outcome_index)) + ")\n"
            "Challenger Evidence URL: " + evidence_url + "\n"
            "Challenger Reasoning: " + reasoning + "\n\n"
            "Research the evidence and make your judgment. Return in JSON format:\n"
            "- is_valid: true if the dispute is valid and resolution should be overturned\n"
            "- correct_outcome: the outcome you believe is correct\n"
            "- correct_outcome_index: 0-based index of the correct outcome\n"
            "- reasoning: explanation of your judgment"
        )

        def leader_fn():
            response = gl.nondet.exec_prompt(prompt, response_format="json")
            return response

        def validator_fn(leader_result):
            if not isinstance(leader_result, gl.vm.Return):
                return False
            validator_response = leader_fn()
            leader_data = leader_result.calldata
            validator_data = validator_response
            leader_valid = leader_data.get("is_valid", False)
            validator_valid = validator_data.get("is_valid", False)
            return leader_valid == validator_valid

        result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        is_valid = bool(result.get("is_valid", False))

        self.dispute_count = u256(int(self.dispute_count) + 1)
        dispute_id = self.dispute_count

        dispute = DisputeRecord(
            market_id=market_id,
            resolution_id=resolution_id,
            challenger=gl.message.sender_address,
            proposed_outcome=str(result.get("correct_outcome", "")),
            proposed_outcome_index=u32(int(result.get("correct_outcome_index", 0))),
            evidence_url=evidence_url,
            reasoning=str(result.get("reasoning", "")),
            timestamp=str(gl.message.timestamp),
            is_valid=is_valid,
            reviewed=True,
        )

        self.disputes[dispute_id] = dispute

        if is_valid:
            resolution.resolved_outcome = dispute.proposed_outcome
            resolution.resolved_outcome_index = dispute.proposed_outcome_index
            market.resolved_outcome_index = dispute.proposed_outcome_index
            self.markets[market_id] = market

        resolution.is_finalized = True
        self.resolutions[resolution_id] = resolution

    @gl.public.view
    def get_market(self, market_id: str):
        m = self.markets.get(market_id)
        if m is None:
            return None
        return {
            "market_id": m.market_id,
            "question": m.question,
            "description": m.description,
            "outcomes": m.outcomes,
            "outcome_count": int(m.outcome_count),
            "creator": m.creator.as_hex,
            "end_date": m.end_date,
            "is_active": m.is_active,
            "is_resolved": m.is_resolved,
            "resolved_outcome_index": int(m.resolved_outcome_index),
            "created_at": m.created_at,
        }

    @gl.public.view
    def get_position(self, market_id: str, user: str, outcome_index: u32):
        key = self._make_position_key(market_id, user, outcome_index)
        pos = self.positions.get(key)
        if pos is None:
            return None
        return {
            "market_id": pos.market_id,
            "user": pos.user,
            "outcome_index": int(pos.outcome_index),
            "shares": int(pos.shares),
            "avg_price": int(pos.avg_price),
        }

    @gl.public.view
    def get_user_positions(self, market_id: str, user: str):
        market = self.markets.get(market_id)
        if market is None:
            return []
        
        positions = []
        i = u32(0)
        while i < market.outcome_count:
            key = self._make_position_key(market_id, user, i)
            pos = self.positions.get(key)
            if pos is not None:
                if int(pos.shares) > 0:
                    positions.append({
                        "market_id": pos.market_id,
                        "user": pos.user,
                        "outcome_index": int(pos.outcome_index),
                        "shares": int(pos.shares),
                        "avg_price": int(pos.avg_price),
                    })
            i = u32(int(i) + 1)
        return positions

    @gl.public.view
    def get_resolution(self, resolution_id: u256):
        if resolution_id == u256(0) or resolution_id > self.resolution_count:
            raise gl.UserError("Resolution not found")
        r = self.resolutions[resolution_id]
        return {
            "market_id": r.market_id,
            "resolved_outcome": r.resolved_outcome,
            "resolved_outcome_index": int(r.resolved_outcome_index),
            "confidence": int(r.confidence),
            "reasoning": r.reasoning,
            "timestamp": r.timestamp,
            "resolver": r.resolver.as_hex,
            "is_finalized": r.is_finalized,
        }

    @gl.public.view
    def get_resolution_by_market(self, market_id: str):
        resolution_id = self.market_resolutions.get(market_id, u256(0))
        if resolution_id == u256(0):
            return None
        return self.get_resolution(resolution_id)

    @gl.public.view
    def get_dispute(self, dispute_id: u256):
        if dispute_id == u256(0) or dispute_id > self.dispute_count:
            raise gl.UserError("Dispute not found")
        d = self.disputes[dispute_id]
        return {
            "market_id": d.market_id,
            "resolution_id": int(d.resolution_id),
            "challenger": d.challenger.as_hex,
            "proposed_outcome": d.proposed_outcome,
            "proposed_outcome_index": int(d.proposed_outcome_index),
            "evidence_url": d.evidence_url,
            "reasoning": d.reasoning,
            "timestamp": d.timestamp,
            "is_valid": d.is_valid,
            "reviewed": d.reviewed,
        }

    @gl.public.view
    def get_trade(self, trade_id: u256):
        if trade_id == u256(0) or trade_id > self.trade_count:
            raise gl.UserError("Trade not found")
        t = self.trades[trade_id]
        return {
            "trade_id": int(t.trade_id),
            "market_id": t.market_id,
            "user": t.user,
            "outcome_index": int(t.outcome_index),
            "shares": int(t.shares),
            "price_per_share": int(t.price_per_share),
            "total_cost": int(t.total_cost),
            "trade_type": t.trade_type,
            "timestamp": t.timestamp,
        }

    @gl.public.view
    def get_market_trades(self, market_id: str):
        trades = []
        i = u256(1)
        while i <= self.trade_count:
            t = self.trades.get(i)
            if t is not None and t.market_id == market_id:
                trades.append({
                    "trade_id": int(t.trade_id),
                    "market_id": t.market_id,
                    "user": t.user,
                    "outcome_index": int(t.outcome_index),
                    "shares": int(t.shares),
                    "price_per_share": int(t.price_per_share),
                    "total_cost": int(t.total_cost),
                    "trade_type": t.trade_type,
                    "timestamp": t.timestamp,
                })
            i = u256(int(i) + 1)
        return trades

    @gl.public.view
    def get_resolution_count(self):
        return int(self.resolution_count)

    @gl.public.view
    def get_dispute_count(self):
        return int(self.dispute_count)

    @gl.public.view
    def get_trade_count(self):
        return int(self.trade_count)

    @gl.public.view
    def get_min_resolution_fee(self):
        return int(self.min_resolution_fee)

    @gl.public.view
    def get_min_dispute_fee(self):
        return int(self.min_dispute_fee)
