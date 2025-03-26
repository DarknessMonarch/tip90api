const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const path = require('path');
const fs = require('fs');

dotenv.config();

const emailTransporter = () => {
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_FROM,
      pass: process.env.EMAIL_PASSWORD,
    }
  });
};

const sendTemplatedEmail = async (options) => {
  const { 
    to, 
    subject, 
    templatePath, 
    replacements 
  } = options;

  if (!to) {
    throw new Error('Recipient email is required.');
  }

  try {
    let template = fs.readFileSync(templatePath, 'utf-8');
    
    Object.entries(replacements).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, value);
    });

    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html: template,
    };

    const transporter = emailTransporter();
    const info = await transporter.sendMail(mailOptions);
    return { success: true, message: `Email sent successfully.`, info };
  } catch (error) {
    console.error('Email sending error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

exports.sendWelcomeEmail = async (email, username) => {
  if (!email || !username) {
    throw new Error('Email and username are required to send a welcome email.');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'Welcome to tips90prediction',
    templatePath: path.join(__dirname, '../client/welcome.html'),
    replacements: { username }
  });
};

// VIP Subscription email
exports.sendVipSubcriptionEmail = async (email, username, duration, plan, activation, expire) => {
  if (!email || !username) {
    throw new Error('Email and username are required to send a VIP subscription email.');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'VIP Activated',
    templatePath: path.join(__dirname, '../client/vipSubcriptionActive.html'),
    replacements: { 
      username,
      duration,
      plan,
      activation,
      expire
    }
  });
};

exports.sendVipExpiration = async (email, username, expire) => {
  if (!email || !username) {
    throw new Error('Email and username are required to send a VIP expiration email.');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'VIP Expired',
    templatePath: path.join(__dirname, '../client/vipExpires.html'),
    replacements: { 
      username,
      expiryDate: expire
    }
  });
};

exports.sendVerificationCodeEmail = async (email, username, verificationCode) => {
  if (!email || !username) {
    throw new Error('Email and username are required to send a verification email.');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'Your Verification Code',
    templatePath: path.join(__dirname, '../client/verification.html'),
    replacements: { 
      username,
      verificationCode
    }
  });
};

exports.contactEmail = async (email, username, message) => {
  if (!email || !username || !message) {
    throw new Error('Email, username and message are required to send a contact email.');
  }

  return sendTemplatedEmail({
    to: process.env.EMAIL_FROM, 
    subject: 'Contact Us',
    templatePath: path.join(__dirname, '../client/contact.html'),
    replacements: { 
      username,
      email,
      message
    }
  });
};

// Newsletter emails with batch processing
exports.sendNewsletterEmails = async (emails, subject, message) => {
  const batchSize = 10;
  const batchDelay = 10000; 
  const successfulEmails = [];
  const transporter = emailTransporter();
  const templatePath = path.join(__dirname, '../client/newsletters.html');
  const template = fs.readFileSync(templatePath, 'utf-8');

  try {
    if (Array.isArray(emails)) {
      for (let i = 0; i < emails.length; i += batchSize) {
        const batchEmails = emails.slice(i, i + batchSize);
        
        const promises = batchEmails.map(email => {
          const username = email.split('@')[0];
          let personalizedTemplate = template
            .replace(/{{username}}/g, username)
            .replace(/{{message}}/g, message)
            .replace(/{{subject}}/g, subject);

          let mailOptions = {
            from: process.env.EMAIL_FROM,
            to: email,
            subject,
            html: personalizedTemplate,
          };

          return transporter.sendMail(mailOptions);
        });

        const results = await Promise.all(promises);
        successfulEmails.push(...results
          .filter(result => result.accepted && result.accepted.length > 0)
          .map(result => result.accepted[0]));
        
        if (i + batchSize < emails.length) {
          await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
      }
    } else {
      const username = emails.split('@')[0];
      const personalizedTemplate = template
        .replace(/{{username}}/g, username)
        .replace(/{{message}}/g, message)
        .replace(/{{subject}}/g, subject);

      let mailOptions = {
        from: process.env.EMAIL_FROM,
        to: emails,
        subject,
        html: personalizedTemplate,
      };
      
      const result = await transporter.sendMail(mailOptions);
      if (result.accepted && result.accepted.length > 0) {
        successfulEmails.push(result.accepted[0]);
      }
    }

    return successfulEmails;
  } catch (error) {
    console.error('Newsletter email error:', error);
    throw new Error('Failed to send newsletter emails');
  }
};

exports.sendVipRemainder = async (email, username, duration) => {
  if (!email || !username) {
    throw new Error('Email and username are required to send a VIP remainder email.');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'Your VIP Reminder',
    templatePath: path.join(__dirname, '../client/remainder.html'),
    replacements: { 
      username,
      duration
    }
  });
};

exports.sendAdminEmail = async (email, username, makeAdmin) => {
  if (!email || !username) {
    throw new Error('Email and username required for admin status email');
  }

  const emailData = {
    title: makeAdmin ? 'Welcome New Admin' : 'Admin Access Removed',
    message: makeAdmin 
      ? 'You now have admin privileges. Access the admin panel to manage site features.'
      : 'Your admin access has been revoked. You no longer have access to admin features.',
    subject: makeAdmin ? 'Admin Access Granted' : 'Admin Access Removed'
  };

  return sendTemplatedEmail({
    to: email,
    subject: emailData.subject,
    templatePath: path.join(__dirname, '../client/adminEmail.html'),
    replacements: { 
      username,
      title: emailData.title,
      message: emailData.message
    }
  });
};

exports.sendVipUnsubcriptionEmail = async (email, username) => {
  if (!email || !username) {
    throw new Error('Email and username required for VIP unsubscription email');
  }

  return sendTemplatedEmail({
    to: email,
    subject: 'VIP Unsubscribed',
    templatePath: path.join(__dirname, '../client/vipUnsubscribe.html'),
    replacements: { username }
  });
};

exports.sendPasswordResetEmail = async (username, email, resetToken) => {
  try {
    const resetUrl = `${process.env.WEBSITE_LINK}/authentication/reset/${resetToken}`;
    
    return sendTemplatedEmail({
      to: email,
      subject: 'Password Reset Request',
      templatePath: path.join(__dirname, '../client/passwordEmailReset.html'),
      replacements: { 
        username,
        resetUrl
      }
    });
  } catch (error) {
    console.error('Error sending reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

exports.sendResetSucessfulEmail = async (username, email) => {
  return sendTemplatedEmail({
    to: email,
    subject: 'Password Reset Successful',
    templatePath: path.join(__dirname, '../client/passwordResetSuccesful.html'),
    replacements: { username }
  });
};

exports.deleteAccountEmail = async (email, username, details) => {
  const subject = details.deletedByAdmin
    ? 'Your Account Has Been Deleted by Administrator'
    : 'Account Deletion Successful';

  const deletionDate = new Date(details.deletionDate).toLocaleString();

  let message = ``;
  if (details.deletedByAdmin) {
    message += `Your account has been deleted by an administrator (${process.env.EMAIL_FROM}) on ${deletionDate}.`;
    if (details.bulkDeletion) {
      message += '\nThis action was part of a bulk account cleanup process.';
    }
  } else {
    message += `As requested, your account has been successfully deleted on ${deletionDate}.`;
  }

  return sendTemplatedEmail({
    to: email,
    subject,
    templatePath: path.join(__dirname, '../client/accountDeleted.html'),
    replacements: { 
      username,
      message
    }
  });
};

module.exports = exports;