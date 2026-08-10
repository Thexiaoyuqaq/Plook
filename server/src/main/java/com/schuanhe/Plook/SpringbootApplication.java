package com.schuanhe.Plook;

import com.schuanhe.Plook.utils.CurPool;
import com.schuanhe.Plook.config.AppProperties;
import com.schuanhe.Plook.service.SocketService;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
@EnableScheduling
public class SpringbootApplication {

    public static void main(String[] args) {
        SpringApplication.run(SpringbootApplication.class, args);
    }

    @Bean
    CommandLineRunner initializeRooms(AppProperties appProperties) {
        return args -> {
            AppProperties.Rooms roomsConfig = appProperties.rooms();
            SocketService.configure(roomsConfig);
            long emptyDisbandMinutes = roomsConfig == null ? 10L : roomsConfig.emptyDisbandMinutes();
            CurPool.reset(emptyDisbandMinutes);
        };
    }
}
