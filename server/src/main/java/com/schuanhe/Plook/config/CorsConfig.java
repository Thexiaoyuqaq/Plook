package com.schuanhe.Plook.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter(AppProperties appProperties) {
        CorsConfiguration configuration = new CorsConfiguration();
        if (appProperties.cors() != null && appProperties.cors().allowedOriginPatterns() != null) {
            appProperties.cors().allowedOriginPatterns().stream()
                    .map(String::trim)
                    .filter(origin -> !origin.isEmpty())
                    .forEach(configuration::addAllowedOriginPattern);
        }
        configuration.addAllowedHeader("*");
        configuration.addAllowedMethod("*");
        configuration.setAllowCredentials(true);
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return new CorsFilter(source);
    }
}
