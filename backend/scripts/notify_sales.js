const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const Game = require('../models/Game');
const Notification = require('../models/Notification');

async function runSalesNotifier() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ DB Connected. [위시리스트 할인 알림] 발송 시스템 가동...');

        // 1. 이메일 전송기 세팅 (기존 비밀번호 찾기에 쓰던 환경변수 재활용)
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });

        // 2. 찜 목록(wishlist)이 1개라도 있는 모든 유저 조회
        const users = await User.find({ wishlist: { $exists: true, $not: {$size: 0} } }).lean();
        if (users.length === 0) {
            console.log('대기 중인 위시리스트가 없습니다.');
            process.exit(0);
        }

        // ★ 스팸 방지 쿨타임: 최근 14일 이내에 동일한 게임의 알림을 보냈으면 이메일 스킵
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() - 14);

        let emailsSent = 0;
        let notificationsCreated = 0;

        for (const user of users) {
            if (!user.email) continue;

            // 유저의 찜 목록 게임 중 '할인율이 0% 초과'인 게임만 싹 긁어옴
            const wishlistGames = await Game.find({
                slug: { $in: user.wishlist },
                'price_info.discount_percent': { $gt: 0 }
            }).lean();

            if (wishlistGames.length === 0) continue;

            const gamesToNotify = [];

            for (const game of wishlistGames) {
                // 쿨타임 검사: 14일 내에 이 게임의 세일 알림(Notification)이 생성된 적 있는지 확인
                const alreadyNotified = await Notification.exists({
                    userId: user._id,
                    gameSlug: game.slug,
                    createdAt: { $gte: cooldownDate }
                });

                if (!alreadyNotified) {
                    gamesToNotify.push(game);
                    
                    // 앱 내 알림(DB) 생성
                    await Notification.create({
                        userId: user._id,
                        type: 'SALE',
                        title: '찜한 게임 할인 시작',
                        message: `[${game.title_ko || game.title}] 게임이 현재 ${game.price_info.discount_percent}% 할인 중입니다!`,
                        gameSlug: game.slug,
                        discountPercent: game.price_info.discount_percent
                    });
                    notificationsCreated++;
                }
            }

            // 새롭게 할인 소식이 있는 게임만 모아서 한 통의 이메일로 전송
            if (gamesToNotify.length > 0) {
                // emailAlert 설정이 false인 경우 이메일 발송 스킵 (앱 내 알림은 유지)
                if (user.notificationSettings?.emailAlert === false) continue;

                let emailHtml = `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #141414; color: #ffffff; padding: 20px; border-radius: 8px;">
                        <h2 style="color: #E50914;">🔥 찜하신 게임이 할인 중입니다!</h2>
                        <p>${user.displayName || user.username}님, 기다리시던 게임이 세일을 시작했습니다.</p>
                        <ul style="list-style: none; padding: 0;">
                `;
                
                gamesToNotify.forEach(g => {
                    emailHtml += `
                        <li style="background-color: #222; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #E50914;">
                            <strong style="font-size: 16px;">${g.title_ko || g.title}</strong><br/>
                            <span style="color: #999; font-size: 14px;">할인율:</span> <span style="color: #E50914; font-weight: bold; font-size: 18px;">${g.price_info.discount_percent}%</span><br/>
                            <span style="color: #999; font-size: 14px;">현재가:</span> ₩${g.price_info.current_price?.toLocaleString()}<br/>
                            <a href="https://playforyou.net/game/${g.slug}" style="display: inline-block; margin-top: 10px; color: #fff; background-color: #E50914; text-decoration: none; padding: 8px 12px; border-radius: 4px; font-weight: bold; font-size: 12px;">스토어 바로가기</a>
                        </li>
                    `;
                });

                emailHtml += `
                        </ul>
                        <p style="color: #999; font-size: 12px; margin-top: 20px;">Play For You에서 더 많은 맞춤 추천을 확인해 보세요.</p>
                    </div>
                `;

                await transporter.sendMail({
                    from: `"Play For You" <${process.env.EMAIL_USER}>`,
                    to: user.email,
                    subject: `[Play For You] 찜하신 게임 ${gamesToNotify.length}개가 할인 중입니다!`,
                    html: emailHtml
                });
                
                emailsSent++;
                console.log(`✉️ ${user.username}(${user.email})님에게 알림 메일 발송 완료.`);
            }
        }

        // ── 목표 가격 알림 처리 ─────────────────────────────────────────────
        const priceAlertUsers = await User.find({
            'priceAlerts.0': { $exists: true }
        }).lean();

        let priceAlertsSent = 0;

        for (const user of priceAlertUsers) {
            if (!user.email) continue;
            const slugs = user.priceAlerts.map(a => a.slug);
            const games = await Game.find({ slug: { $in: slugs } })
                .select('slug title title_ko price_info')
                .lean();

            const triggered = [];

            for (const alert of user.priceAlerts) {
                const game = games.find(g => g.slug === alert.slug);
                if (!game) continue;
                const currentPrice = game.price_info?.current_price || 0;
                if (currentPrice <= 0 || currentPrice > alert.targetPrice) continue;

                const alreadyNotified = await Notification.exists({
                    userId: user._id,
                    gameSlug: game.slug,
                    type: 'PRICE_ALERT',
                    createdAt: { $gte: cooldownDate }
                });
                if (alreadyNotified) continue;

                triggered.push({ game, targetPrice: alert.targetPrice });
                await Notification.create({
                    userId: user._id,
                    type: 'PRICE_ALERT',
                    title: '목표 가격 달성!',
                    message: `[${game.title_ko || game.title}] 목표가 ${alert.targetPrice.toLocaleString()}원 이하로 떨어졌습니다! 현재가: ${currentPrice.toLocaleString()}원`,
                    gameSlug: game.slug,
                });
                notificationsCreated++;
            }

            if (triggered.length === 0) continue;
            if (user.notificationSettings?.emailAlert === false) continue;

            let emailHtml = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background-color: #141414; color: #ffffff; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #4CAF50;">목표 가격 달성!</h2>
                    <p>${user.displayName || user.username}님, 설정하신 목표 가격에 도달했습니다.</p>
                    <ul style="list-style: none; padding: 0;">
            `;
            triggered.forEach(({ game, targetPrice }) => {
                emailHtml += `
                    <li style="background-color: #222; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #4CAF50;">
                        <strong style="font-size: 16px;">${game.title_ko || game.title}</strong><br/>
                        <span style="color: #999; font-size: 14px;">목표가:</span> ₩${targetPrice.toLocaleString()}<br/>
                        <span style="color: #999; font-size: 14px;">현재가:</span> <span style="color: #4CAF50; font-weight: bold;">₩${game.price_info.current_price?.toLocaleString()}</span><br/>
                        <a href="https://playforyou.net/game/${game.slug}" style="display: inline-block; margin-top: 10px; color: #fff; background-color: #4CAF50; text-decoration: none; padding: 8px 12px; border-radius: 4px; font-weight: bold; font-size: 12px;">지금 구매하기</a>
                    </li>
                `;
            });
            emailHtml += `</ul></div>`;

            await transporter.sendMail({
                from: `"Play For You" <${process.env.EMAIL_USER}>`,
                to: user.email,
                subject: `[Play For You] 목표 가격 달성 알림 (${triggered.length}개 게임)`,
                html: emailHtml
            });
            priceAlertsSent++;
            console.log(`✉️ [목표가격] ${user.email}님 알림 발송`);
        }

        console.log(`\n알림 작업 완료!`);
        console.log(`   위시리스트 할인: ${notificationsCreated}건 / 이메일: ${emailsSent}통`);
        console.log(`   목표가격 알림: ${priceAlertsSent}통`);
        process.exit(0);

    } catch (error) {
        console.error("알림 시스템 크래시:", error);
        process.exit(1);
    }
}

runSalesNotifier();