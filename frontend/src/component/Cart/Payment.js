import React, { Fragment, useEffect, useRef, useState } from "react";
import CheckoutSteps from "../Cart/CheckoutSteps";
import { useSelector, useDispatch } from "react-redux";
import MetaData from "../layout/MetaData";
import { Typography } from "@material-ui/core";
import { useAlert } from "react-alert";
import axios from "axios";
import "./payment.css";
import CreditCardIcon from "@material-ui/icons/CreditCard";
import EventIcon from "@material-ui/icons/Event";
import VpnKeyIcon from "@material-ui/icons/VpnKey";
import { createOrder, clearErrors } from "../../actions/orderAction";

const Payment = ({ history }) => {
  const orderInfo = JSON.parse(sessionStorage.getItem("orderInfo"));

  const dispatch = useDispatch();
  const alert = useAlert();
  const payBtn = useRef(null);

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  const { shippingInfo, cartItems } = useSelector((state) => state.cart);
  const { error } = useSelector((state) => state.newOrder);

  const paymentData = {
    amount: Math.round((orderInfo ? orderInfo.totalPrice : 0) * 100),
  };

  const order = {
    shippingInfo,
    orderItems: cartItems,
    itemsPrice: orderInfo ? orderInfo.subtotal : 0,
    taxPrice: orderInfo ? orderInfo.tax : 0,
    shippingPrice: orderInfo ? orderInfo.shippingCharges : 0,
    totalPrice: orderInfo ? orderInfo.totalPrice : 0,
  };

  const submitHandler = async (e) => {
    e.preventDefault();

    payBtn.current.disabled = true;

    try {
      const config = {
        headers: {
          "Content-Type": "application/json",
        },
      };

      await axios.post(
        "/api/v1/payment/process",
        paymentData,
        config
      );

      order.paymentInfo = {
        id: "pay_" + Date.now(),
        status: "succeeded",
      };

      dispatch(createOrder(order));

      history.push("/success");
    } catch (err) {
      payBtn.current.disabled = false;
      alert.error(err.response?.data?.message || "There was an issue processing the payment");
    }
  };

  useEffect(() => {
    if (error) {
      alert.error(error);
      dispatch(clearErrors());
    }
  }, [dispatch, error, alert]);

  return (
    <Fragment>
      <MetaData title="Payment" />
      <CheckoutSteps activeStep={2} />
      <div className="paymentContainer">
        <form className="paymentForm" onSubmit={(e) => submitHandler(e)}>
          <Typography>Card Info</Typography>
          <div>
            <CreditCardIcon />
            <input
              type="text"
              placeholder="Card Number"
              required
              className="paymentInput"
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
            />
          </div>
          <div>
            <EventIcon />
            <input
              type="text"
              placeholder="MM/YY"
              required
              className="paymentInput"
              value={cardExpiry}
              onChange={(e) => setCardExpiry(e.target.value)}
            />
          </div>
          <div>
            <VpnKeyIcon />
            <input
              type="password"
              placeholder="CVC"
              required
              className="paymentInput"
              value={cardCvc}
              onChange={(e) => setCardCvc(e.target.value)}
            />
          </div>

          <input
            type="submit"
            value={`Pay - ₹${orderInfo && orderInfo.totalPrice}`}
            ref={payBtn}
            className="paymentFormBtn"
          />
        </form>
      </div>
    </Fragment>
  );
};

export default Payment;
