const crypto = require("crypto");
const bcrypt = require("bcrypt");
const JWT = require("jsonwebtoken");
const User = require("../Models/user.mongo");
const Token = require("../Models/token.mongo");
const sendEmail = require("../Utils/email/sendEmail.email");

require("dotenv").config();

const bcryptSaltRounds = process.env.BCRYPT_SALT || 10;
const clientURL = process.env.CLIENT_URL;
const JWTSecret = process.env.JWT_SECRET;
const tokenExpiryTime = 15 * 60 * 1000; // 15 minutes for password reset token

const signup = async (data) => {
  try {
    let user = await User.findOne({ email: data.email });
    if (user) throw new Error("Email already exists");

    user = new User(data);
    const token = JWT.sign({ id: user._id }, JWTSecret, { expiresIn: "1h" });
    await user.save();

    return {
      userId: user._id,
      email: user.email,
      token: token,
    };
  } catch (error) {
    throw new Error(error.message);
  }
};

const requestPasswordReset = async (email) => {
  try {
    const user = await User.findOne({ email });
    if (!user) throw new Error("User does not exist");

    let token = await Token.findOne({ userId: user._id });
    if (token) await token.deleteOne();

    let resetToken = crypto.randomBytes(32).toString("hex");
    const hash = await bcrypt.hash(resetToken, bcryptSaltRounds);

    await new Token({
      userId: user._id,
      token: hash,
      createdAt: Date.now(),
      expiresAt: Date.now() + tokenExpiryTime,
    }).save();

    const link = `${clientURL}/passwordReset?token=${resetToken}&id=${user._id}`;
    sendEmail(
      user.email,
      "Password Reset Request",
      { link: link },
      "./template/requestResetPassword.handlebars"
    );
    return link;
  } catch (error) {
    throw new Error(error.message);
  }
};

const resetPassword = async (userId, token, password) => {
  try {
    let passwordResetToken = await Token.findOne({ userId });
    if (!passwordResetToken) throw new Error("Invalid or expired password reset token");

    const isValid = await bcrypt.compare(token, passwordResetToken.token);
    if (!isValid) throw new Error("Invalid or expired password reset token");

    if (Date.now() > passwordResetToken.expiresAt) {
      throw new Error("Token has expired");
    }

    const hash = await bcrypt.hash(password, bcryptSaltRounds);
    await User.updateOne(
      { _id: userId },
      { $set: { password: hash } },
      { new: true }
    );

    const user = await User.findById(userId);
    sendEmail(
      user.email,
      "Password Reset Successfully",
      {},
      "./template/resetPassword.handlebars"
    );
    await passwordResetToken.deleteOne();
    return true;
  } catch (error) {
    throw new Error(error.message);
  }
};

module.exports = {
  signup,
  requestPasswordReset,
  resetPassword,
};
